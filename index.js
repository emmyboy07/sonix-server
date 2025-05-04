const puppeteer = require('puppeteer'); // Regular Puppeteer
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const UserAgent = require('user-agents');
require('dotenv').config();

const app = express();
app.use(cors());

const TMDB_API_KEY = '1e2d76e7c45818ed61645cb647981e5c';

// Cache for TMDB data to reduce API calls
const tmdbCache = new Map();
// Cache for download links to reduce scraping
const downloadCache = new Map();

async function getTMDBData(tmdb_id, type) {
    // Check cache first
    const cacheKey = `${type}_${tmdb_id}`;
    if (tmdbCache.has(cacheKey)) {
        console.log(`📋 Using cached TMDB data for ${cacheKey}`);
        return tmdbCache.get(cacheKey);
    }

    const url = `https://api.themoviedb.org/3/${type}/${tmdb_id}?api_key=${TMDB_API_KEY}`;
    try {
        console.log(`🔍 Fetching TMDB data for ${type} ID: ${tmdb_id}`);
        const response = await axios.get(url);
        
        // Cache the result for 24 hours
        tmdbCache.set(cacheKey, response.data);
        setTimeout(() => tmdbCache.delete(cacheKey), 24 * 60 * 60 * 1000);
        
        return response.data;
    } catch (error) {
        console.error(`❌ TMDB fetch error: ${error.message}`);
        return null;
    }
}

async function createBrowser() {
    console.log("🚀 Launching headless browser...");
    
    // Generate a random user agent
    const userAgent = new UserAgent({ deviceCategory: 'desktop' });
    
    const browser = await puppeteer.launch({
        headless: 'new', // Change to 'true' if you want it to run headless
        args: [
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--disable-setuid-sandbox',
            '--disable-features=IsolateOrigins,site-per-process',
            '--disable-web-security',
            '--disable-features=site-per-process',
            '--disable-blink-features=AutomationControlled',
            `--user-agent=${userAgent.toString()}`
        ]
    });

    if (!browser) throw new Error("❌ Browser did not launch");

    const page = await browser.newPage();
    
    // Set a realistic viewport
    await page.setViewport({ 
        width: 1920, 
        height: 1080,
        deviceScaleFactor: 1,
        hasTouch: false,
        isLandscape: true,
        isMobile: false
    });

    // Set cookies to appear more like a regular browser
    await page.setCookie({
        name: 'cookie_consent',
        value: 'true',
        domain: 'moviebox.ng',
        path: '/',
        expires: Date.now() + 1000 * 60 * 60 * 24 * 7, // 1 week
        httpOnly: false,
        secure: true,
        sameSite: 'None'
    });

    // Set extra HTTP headers
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0'
    });

    // Mask webdriver
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined
        });
        
        Object.defineProperty(navigator, 'plugins', {
            get: () => [1, 2, 3, 4, 5]
        });
        
        Object.defineProperty(navigator, 'languages', {
            get: () => ['en-US', 'en']
        });
        
        if (!window.chrome) {
            window.chrome = {};
            window.chrome.runtime = {};
        }
    });

    return { browser, page };
}

async function fetchDownloadLink(title, expectedYear = null, matchYear = true, season = 0, episode = 0) {
    // Check cache first
    const cacheKey = `${title}_${expectedYear}_${season}_${episode}`;
    if (downloadCache.has(cacheKey)) {
        console.log(`📋 Using cached download data for ${cacheKey}`);
        return downloadCache.get(cacheKey);
    }
    
    let browser;
    try {
        console.log(`🎬 Searching MovieBox for: ${title} ${expectedYear || ''}`);
        const { browser: b, page } = await createBrowser();
        browser = b;

        // Add a delay before navigating to avoid detection
        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));

        const searchQuery = matchYear && expectedYear ? `${title} ${expectedYear}` : title;
        const searchUrl = `https://moviebox.ng/web/searchResult?keyword=${encodeURIComponent(searchQuery)}`;
        
        console.log(`🔍 Navigating to search URL: ${searchUrl}`);
        await page.goto(searchUrl, { 
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        // Add random delay to simulate human behavior
        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
        
        // Wait for search results
        console.log(`⏳ Waiting for search results...`);
        await page.waitForSelector('div.pc-card-btn', { timeout: 60000 });
        
        // Add another random delay
        await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));

        let found = false;
        let movieUrl;
        let subjectId;
        let downloadData;

        // Try up to 4 search results
        for (let i = 1; i <= 4; i++) {
            console.log(`➡️ Trying result #${i}`);

            // Click on the search result using a more reliable method
            await page.evaluate((index) => {
                const results = document.querySelectorAll('div.pc-card-btn');
                if (results.length >= index) {
                    results[index - 1].click();
                }
            }, i);

            // Wait for navigation with a generous timeout
            await page.waitForNavigation({ 
                waitUntil: 'networkidle2',
                timeout: 30000 
            });
            
            movieUrl = page.url();
            console.log(`📄 Movie page URL: ${movieUrl}`);

            // Extract title from the movie page
            let extractedTitle = '';
            try {
                extractedTitle = await page.$eval('h2.pc-title', el => el.innerText.trim());
                console.log(`📝 Extracted title: ${extractedTitle}`);
            } catch (e) {
                console.log(`⚠️ Could not extract title: ${e.message}`);
            }

            // Normalize titles for comparison
            const normalize = str => str.toLowerCase().replace(/[^a-z0-9]/g, '');
            let titleMatch = normalize(extractedTitle) === normalize(title);
            let yearMatch = true;

            if (matchYear && expectedYear) {
                try {
                    const releaseDateText = await page.$eval('div.pc-time', el => el.innerText);
                    const foundYear = releaseDateText.split('-')[0];
                    yearMatch = foundYear === expectedYear;
                    console.log(`📅 Found year: ${foundYear}, Expected: ${expectedYear}, Match: ${yearMatch}`);
                } catch (e) {
                    yearMatch = false;
                    console.log(`⚠️ Could not extract year: ${e.message}`);
                }
            }

            if (titleMatch && yearMatch) {
                found = true;
                console.log(`✅ Found matching content: ${extractedTitle} (${expectedYear || 'N/A'})`);
                break;
            } else {
                console.log(`❌ No match: title=${titleMatch}, year=${yearMatch}`);
            }

            // Go back to search results
            await page.goBack({ waitUntil: 'networkidle2' });
            
            // Add random delay between attempts
            await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1500));
            
            // Wait for search results to load again
            await page.waitForSelector('div.pc-card-btn');
        }

        if (!found) {
            console.log(`❌ No matching content found for ${title} ${expectedYear || ''}`);
            return { error: "Download unavailable" };
        }

        // Extract subject ID from URL
        const subjectIdMatch = movieUrl.match(/id=(\d+)/);
        if (!subjectIdMatch) {
            throw new Error("❌ Could not extract subjectId from URL.");
        }

        subjectId = subjectIdMatch[1];
        console.log(`🔑 Subject ID: ${subjectId}`);

        // Construct download API URL
        const downloadApiUrl = `https://moviebox.ng/wefeed-h5-bff/web/subject/download?subjectId=${subjectId}&se=${season}&ep=${episode}`;
        const refererHeader = movieUrl;

        console.log(`🧠 Fetching download data for subjectId ${subjectId}...`);

        // Add random delay before fetching download data
        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

        // Use a more robust fetch implementation
        downloadData = await page.evaluate(async (url, referer) => {
            try {
                // Create a custom fetch function that includes all necessary headers
                const customFetch = async (fetchUrl) => {
                    const response = await fetch(fetchUrl, {
                        method: 'GET',
                        headers: {
                            'Referer': referer,
                            'Accept': 'application/json, text/plain, */*',
                            'Accept-Language': 'en-US,en;q=0.9',
                            'Cache-Control': 'no-cache',
                            'Connection': 'keep-alive',
                            'Pragma': 'no-cache',
                            'Sec-Fetch-Dest': 'empty',
                            'Sec-Fetch-Mode': 'cors',
                            'Sec-Fetch-Site': 'same-origin'
                        },
                        credentials: 'include',
                        mode: 'cors'
                    });
                    
                    if (!response.ok) {
                        throw new Error(`HTTP error! Status: ${response.status}`);
                    }
                    
                    return response.json();
                };
                
                // Try up to 3 times with increasing delays
                let attempts = 0;
                let lastError;
                
                while (attempts < 3) {
                    try {
                        return await customFetch(url);
                    } catch (error) {
                        lastError = error;
                        attempts++;
                        // Wait before retrying
                        await new Promise(r => setTimeout(r, attempts * 1000));
                    }
                }
                
                return { error: `Failed after ${attempts} attempts: ${lastError?.message || 'Unknown error'}` };
            } catch (error) {
                return { error: `Failed to fetch download data: ${error.message}` };
            }
        }, downloadApiUrl, refererHeader);

        if (downloadData?.error) {
            console.error(`❌ Download data error: ${downloadData.error}`);
            return { error: downloadData.error };
        }

        console.log(`✅ Successfully fetched download data`);
        
        // Create result object
        const result = {
            title,
            releaseYear: expectedYear,
            subjectId,
            movieUrl,
            downloadApiUrl,
            data: downloadData
        };
        
        // Cache the result for 6 hours
        downloadCache.set(cacheKey, result);
        setTimeout(() => downloadCache.delete(cacheKey), 6 * 60 * 60 * 1000);
        
        return result;

    } catch (error) {
        console.error(`💥 Error: ${error.message}`);
        return { error: error.message };
    } finally {
        if (browser) {
            console.log("🧹 Closing browser");
            await browser.close();
        }
    }
}

// Health check endpoint
app.get("/", (req, res) => {
    res.json({ status: "ok", message: "MovieBox API is running" });
});

// Main download endpoint
app.get("/download", async (req, res) => {
    const tmdb_id = req.query.tmdb_id;
    const type = req.query.type === 'tv' ? 'tv' : 'movie';

    if (!tmdb_id) {
        return res.status(400).json({ error: "Please provide a TMDB ID using the 'tmdb_id' query parameter" });
    }

    console.log(`📝 Received request for ${type} ID: ${tmdb_id}`);

    const season = parseInt(req.query.se || '0', 10);
    const episode = parseInt(req.query.ep || '0', 10);

    try {
        const tmdbData = await getTMDBData(tmdb_id, type);
        if (!tmdbData) {
            return res.status(500).json({ error: "Could not fetch data from TMDB" });
        }

        const title = type === 'tv' ? tmdbData.name : tmdbData.title;
        const expectedYear = tmdbData.release_date ? tmdbData.release_date.split('-')[0] : null;

        console.log(`🎬 Found TMDB data for ${title} (${expectedYear || 'N/A'})`);

        const downloadResult = await fetchDownloadLink(title, expectedYear, true, season, episode);

        if (downloadResult.error) {
            return res.status(500).json(downloadResult);
        }

        return res.json(downloadResult);
    } catch (error) {
        console.error(`💥 Error: ${error.message}`);
        return res.status(500).json({ error: error.message });
    }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`✅ Server running on port ${port}`);
});
