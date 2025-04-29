
# 🎬 TMDB to MovieBox Bot

This Node.js project lets you fetch download links for movies and TV shows from [MovieBox.ng](https://moviebox.ng) using a TMDB ID. It combines TMDB's API with Puppeteer-based web scraping to find matching titles and return the appropriate download link.

---

## 🚀 Features

- Search for movies or TV shows using TMDB ID.
- Automatically matches title and year on MovieBox.
- Extracts the download URL directly from MovieBox.
- Built-in Express server for easy API access.
- CORS enabled.
- Environment variable support using `.env`.

---

## 📦 Installation

1. **Clone the repository**:

```bash
git clone https://github.com/your-username/tmdb-to-moviebox-bot.git
cd tmdb-to-moviebox-bot
```

2. **Install dependencies**:

```bash
npm install
```

3. **Create a `.env` file** (optional):

```env
PORT=10000
```

4. **Run the server**:

```bash
npm start
```

Or in development mode with auto-restart:

```bash
npm run dev
```

---

## 🌐 API Endpoint

### `GET /download`

Fetch a download link from MovieBox.ng using a TMDB ID.

**Query Parameters**:

| Parameter | Type   | Required | Description                    |
|-----------|--------|----------|--------------------------------|
| `tmdb_id` | string | Yes      | TMDB ID of the movie/show      |
| `type`    | string | No       | `movie` (default) or `tv`      |

**Example**:

```
GET http://localhost:10000/download?tmdb_id=299054&type=movie
```

**Response**:

```json
{
  "title": "Captain America: Brave New World",
  "releaseYear": "2025",
  "downloadUrl": "https://moviebox.ng/wefeed-h5-bff/web/subject/download?subjectId=XXXX&se=0&ep=0"
}
```

If no match is found:

```json
{
  "error": "Download unavailable"
}
```

---

## 🛠️ Technologies Used

- [Node.js](https://nodejs.org/)
- [Express](https://expressjs.com/)
- [Puppeteer](https://pptr.dev/)
- [TMDB API](https://developers.themoviedb.org/3)
- [MovieBox.ng](https://moviebox.ng)

---

## ⚠️ Disclaimer

This project is for **educational purposes** only. It does not host or store any movie content and simply automates interaction with publicly available websites.

---

## 📄 License

MIT License
