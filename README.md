# DLsite Async (TypeScript)

Async DLsite API client for TypeScript. A port of the Python library
[dlsite-async](https://github.com/bhrevol/dlsite-async) to modern
TypeScript with strict typing.

## Features

- Fetch work metadata from most DLsite sites (Doujin, Books, Comipo, etc.)
- Japanese and English locale support
- List purchased works via DLsite Play (`PlayAPI.purchases()`)
- Download web-optimized versions of purchased works
- Download ebook viewer pages (`ebook_fixed`, `ebook_voicecomic`,
  `ebook_webtoon`, `voicecomic_v2`) including voicecomic audio
- Download fixed-layout epub viewer pages (CSR)
- Assemble reflowable epubs (CSR-R) into `.epub` files, including text and
  image de-obfuscation
- Descramble scrambled images (requires optional `sharp` dependency)

## Installation

This package is distributed via GitHub — it is not published to the npm
registry. Install it from a release tag:

```console
$ npm install daydreamer-json/dlsite-async-ts#v0.1.0
# or
$ bun add daydreamer-json/dlsite-async-ts#v0.1.0
```

Image processing features require [sharp]:

```console
$ npm install sharp
```

[sharp]: https://sharp.pixelplumbing.com/

## Requirements

- Node.js 20+ / Bun / Deno (any runtime with standard fetch + WebCrypto)

## Usage examples

### Work lookup

```ts
import { DlsiteAPI } from "dlsite-async-ts";

await using api = new DlsiteAPI();
const work = await api.getWork("RJ294126");
console.log(work.workName);      // "Pure Pussy on Duty"
console.log(work.circle);        // "aoharu fetishism"
console.log(work.voiceActor);    // ["逢坂成美"]
console.log(work.registDate?.toISODate());
```

`await using` closes the session automatically; plain `await api.close()`
also works.

### Login

```ts
import { PlayAPI } from "dlsite-async-ts";

// Credentials may also be read from ~/.netrc (host "dlsite.com").
await using play = new PlayAPI();
await play.login("username", "password");
```

### List purchased works

```ts
for await (const [work, purchasedAt] of play.purchases()) {
  console.log(work.productId, work.workName, purchasedAt?.toISO());
}
```

### Download web-optimized files

```ts
const token = await play.downloadToken("RJ294126");
const tree = await play.ziptree(token);
for (const [path, playfile] of tree.entries()) {
  if (playfile.type !== "image") continue;
  const dest = path.replace(/\.[^.]+$/, extname(playfile.optimizedName));
  await play.downloadPlayfile(token, playfile, dest, {
    mkdir: true,
    descramble: true, // requires sharp
  });
}
```

### Ebook viewer downloads

```ts
import { EbookSession } from "dlsite-async-ts";

const token = await play.downloadToken("BJ635840");
const tree = await play.ziptree(token);
for (const [, playfile] of tree.entries()) {
  if (!playfile.isEbook) continue;
  await using ebook = new EbookSession(play, tree, playfile);
  await ebook.load();
  for (let i = 0; i < ebook.pageCount; i += 1) {
    await ebook.downloadPage(i, "./out", { mkdir: true, convert: "jpg" });
  }
}
```

### Reflowable epub download

```ts
import { EpubReflowableSession } from "dlsite-async-ts";

const epub = new EpubReflowableSession(play, tree, playfile);
await epub.load();
const dest = await epub.downloadEpub("./out", { mkdir: true });
```

## API notes

- All datetimes are [`luxon`](https://moment.github.io/luxon/) `DateTime`
  objects.
- HTTP requests use `ky` over standard `fetch`; a built-in cookie jar keeps
  login sessions alive across redirects.
- RSA key exchange for viewer tokens uses WebCrypto.
- Custom fetch implementations can be injected via
  `new DlsiteAPI(locale, { fetch })` — useful in tests.

### Differences from the Python original

- Image descramble/conversion uses `sharp` instead of Pillow; JPEG output is
  always re-encoded with quality 95 (Pillow's `quality="keep"` has no
  equivalent).
- Field names are camelCase (`work_name` → `workName`).
- HLS video segment downloads are unsupported (same as upstream).

## Development

```console
$ bun install
$ npm run test        # vitest
$ npm run typecheck   # tsc --noEmit (strictest settings)
$ npm run build       # emit dist/ (ESM + declarations)
```

## License

MIT — see the LICENSE of the original project this library was ported from.
