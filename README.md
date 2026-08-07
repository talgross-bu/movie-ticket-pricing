# The Movie Ticket Pricing Challenge

A dependency-free static website for a short Zoom breakout exercise about general-admission movie tickets and verified student pricing. It supports groups of either three or four and keeps every student's role active.

## Learning goals

The exercise asks students to compare uniform and group-based ticket pricing through profit, capacity, consumer surplus, and total surplus. It also prompts them to consider the practical roles of customer verification and resale. The activity leaves the direction and size of these effects for students to derive.

## Student URL

<https://talgross-bu.github.io/movie-ticket-pricing/>

Post only this link in Zoom.

## Open locally

You can double-click `index.html` and run the activity directly from a `file://` URL. No installation or local server is required.

For a hosted-style local preview, serve this directory over HTTP:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000/`.

## Test

The economic rules, state helpers, and deployment contracts use Node's built-in test runner and have no package dependencies:

```sh
npm test
```

## Hosting

GitHub Pages serves this repository from the `main` branch at the root. `_config.yml` excludes non-site project files such as the tests, package metadata, and README from the published site.

Do not add a `.nojekyll` file. It disables Jekyll, and the exclude rule with it.

All links and assets are relative, so the site also works at a root domain or on any other static host.

## License

Licensed under [CC BY 4.0](LICENSE). You are welcome to reuse and adapt the exercise with attribution. The hero image in `assets/` is AI-generated and covered by the same license.

## Data and recovery

The application makes no network requests after its static files load. It stores only the current device's group size, role, controller attempts, phase, and completion flag in `localStorage`. No result is submitted or copied. If local storage is unavailable, the game continues with an on-screen warning but cannot recover after refresh.
