# PetersWeb Solutions website

A responsive website for PetersWeb Solutions. This repository contains the current site source, package details, portfolio, service accordion, testimonials, privacy/terms pages, and the small Python server used for local development and inquiry submissions.

## Run locally

```bash
python3 server.py
```

Then open <http://localhost:8000>. The Python server serves the site and handles `POST /api/inquiries`, storing submissions under `data/` (which is git-ignored).

## Project files

- `index.html` — main website.
- `assets/css/styles.css` — layout and styles.
- `assets/js/config.js` — portfolio destinations, testimonials, and form endpoint settings.
- `assets/js/main.js` — navigation, testimonial carousel, service accordions, form, and portfolio modal behavior.
- `assets/img/` — site images and captured portfolio screenshots.
- `server.py` — local static server and inquiry API.
- `privacy.html`, `terms.html`, `404.html`, `robots.txt` — supporting site pages and crawler rules.
- `data/` — local inquiry storage; private JSONL submissions are excluded from Git.

## Pricing shown on the site

- Basic — ₱1,999 initial payment plus ₱499/month for six months.
- Pro — ₱8,999 one-time.
- Business — ₱14,999 one-time.

## Hosting notes

GitHub Pages can serve the static HTML, CSS, JavaScript, and images in this repository, but it does **not** run `server.py`. The inquiry form currently posts to `/api/inquiries`, which requires the Python server or another configured backend. Before publishing on GitHub Pages, connect the form to a service you control or host the site on a Python-capable service. No email notifications are configured by this source alone.

Review the privacy and terms pages against the business's final practices and requirements before launch.
