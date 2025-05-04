const puppeteer = require('puppeteer');
const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());

const TMDB_API_KEY = '1e2d76e7c45818ed61645cb647981e5c';

async function getTMDBData(tmdb_id, type) {
    const url = `https://api.themoviedb.org/3/${type}/${tmdb_id}?api_key=${TMDB_API_KEY}`;
    try {
        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        console.error(`❌ TMDB fetch error: ${error.message}`);
        return null;
    }
}

async function createBrowser() {
    console.log("🚀 Launching headless browser...");
    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--disable-setuid-sandbox'
        ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    // Important: Strip region info by using plain 'en'
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'en'
    });

    return { browser, page };
}

async function fetchDownloadLink(title, expectedYear = null, matchYear = true, season = 0, episode = 0) {
    let browser;
    try {
        console.log(`🎬 Searching MovieBox for: ${title} ${expectedYear || ''}`);
        const { browser: b, page } = await createBrowser();
        browser = b;

        const searchQuery = matchYear && expectedYear ? `${title} ${expectedYear}` : title;
        const searchUrl = `https://moviebox.ng/web/searchResult?keyword=${encodeURIComponent(searchQuery)}`;
        await page.goto(searchUrl);
        await page.waitForSelector('div.pc-card-btn', { timeout: 60000 });

        let found = false;
        let movieUrl;
        let subjectId;
        let downloadData;

        for (let i = 1; i <= 4; i++) {
            console.log(`➡️ Trying result #${i}`);
            await page.evaluate((index) => {
                const result = document.querySelectorAll('div.pc-card-btn')[index - 1];
                if (result) result.click();
            }, i);

            await page.waitForNavigation({ waitUntil: 'domcontentloaded' });
            movieUrl = page.url();

            let extractedTitle = '';
            try {
                extractedTitle = await page.$eval('h2.pc-title', el => el.innerText.trim());
            } catch {}

            const normalize = str => str.toLowerCase().replace(/[^a-z0-9]/g, '');
            let titleMatch = normalize(extractedTitle) === normalize(title);
            let yearMatch = true;

            if (matchYear) {
                try {
                    const releaseDateText = await page.$eval('div.pc-time', el => el.innerText);
                    const foundYear = releaseDateText.split('-')[0];
                    yearMatch = foundYear === expectedYear;
                } catch {
                    yearMatch = false;
                }
            }

            if (titleMatch && yearMatch) {
                found = true;
                break;
            } else {
                console.log(`❌ No match: title=${titleMatch}, year=${yearMatch}`);
            }

            await page.goBack();
            await page.waitForSelector('div.pc-card-btn');
        }

        if (!found) return { error: "Download unavailable" };

        const subjectIdMatch = movieUrl.match(/id=(\d+)/);
        if (!subjectIdMatch) throw new Error("❌ Could not extract subjectId from URL.");

        subjectId = subjectIdMatch[1];

        const downloadApiUrl = `https://moviebox.ng/wefeed-h5-bff/web/subject/download?subjectId=${subjectId}&se=${season}&ep=${episode}`;
        const refererHeader = movieUrl;

        console.log(`🧠 Injecting fetch script for subjectId ${subjectId}...`);

        downloadData = await page.evaluate(async (url, referer) => {
            try {
                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Referer': referer,
                        'Accept': 'application/json'
                    },
                    credentials: 'include'
                });
                const data = await response.json();
                return data;
            } catch (error) {
                return { error: 'Failed to fetch download data in browser context.' };
            }
        }, downloadApiUrl, refererHeader);

        if (downloadData?.error) {
            return { error: downloadData.error };
        }

        return {
            title,
            releaseYear: expectedYear,
            subjectId,
            movieUrl,
            downloadApiUrl,
            data: downloadData
        };

    } catch (error) {
        console.error(`💥 Error: ${error.message}`);
        return { error: error.message };
    } finally {
        if (browser) await browser.close();
    }
}

app.get("/download", async (req, res) => {
    const tmdb_id = req.query.tmdb_id;
    const type = req.query.type === 'tv' ? 'tv' : 'movie';

    if (!tmdb_id) {
        return res.status(400).json({ error: "Please provide a TMDB ID using the 'tmdb_id' query parameter" });
    }

    const season = parseInt(req.query.se || '0', 10);
    const episode = parseInt(req.query.ep || '0', 10);

    const tmdbData = await getTMDBData(tmdb_id, type);
    if (!tmdbData) {
        return res.status(500).json({ error: "Could not fetch data from TMDB" });
    }

    const title = type === 'tv' ? tmdbData.name : tmdbData.title;
    const expectedYear = type === 'tv' ? null : tmdbData.release_date.split('-')[0];

    const result = await fetchDownloadLink(title, expectedYear, type === 'movie', season, episode);

    if (result.error) {
        return res.status(404).json(result);
    }

    res.json(result);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
