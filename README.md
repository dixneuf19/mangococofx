# Mango Coco Production - Static Website

A static website for Mango Coco Production featuring 3D glasses effects and movie GIF viewing.

## Features

- **3D Mode**: Interactive camera with 3D glasses overlay and animated sprites
- **Watch Mode**: Browse and view existing movie GIFs
- **Mobile Responsive**: Works on both desktop and mobile devices
- **Static Hosting**: Ready for GitHub Pages deployment

## Deployment to GitHub Pages

1. Push this repository to GitHub
2. Go to repository Settings > Pages
3. Select "Deploy from a branch" and choose `main` branch
4. Select `/` (root) as the source folder
5. Save and wait for deployment

The site will be available at `https://yourusername.github.io/mangococofx`

## Local Development

Simply open `index.html` in a web browser or serve it with any static file server:

```bash
# Using Python
python -m http.server 8000

# Using Node.js
npx serve .

# Using PHP
php -S localhost:8000
```

## Files Structure

```
├── index.html          # Main HTML file
├── main.js            # JavaScript functionality
├── styles.css         # CSS styles
├── glasses-20x9.png   # 3D glasses overlay image
├── favicon.ico        # Site favicon
└── gif/               # Movie GIFs
    ├── chicken-run.gif
    ├── matrix-bullet-dodge.gif
    ├── superman-flying.gif
    └── mgcc.gif
```

## Usage

1. **Intro Page**: Choose between "Regarder le film" (Watch Mode) or "Lancer le mode 3D" (3D Mode)
2. **Watch Mode**: Select different movie GIFs to view
3. **3D Mode**: Use camera with 3D glasses overlay and capture photos

## Browser Compatibility

- Modern browsers with camera access support
- Mobile browsers (iOS Safari, Chrome Mobile)
- Requires HTTPS for camera access in production
