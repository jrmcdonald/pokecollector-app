/**
 * Plain placeholder images, drawn without any image library: a card is a
 * coloured panel with a darker art box, its colour taken from the card's id
 * so each card looks different and the same every run.
 */
import { crc32, deflateSync } from 'node:zlib';

type Rgb = [number, number, number];

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** An 8-bit RGB PNG whose pixels come from `paint(x, y)`. */
export function encodePng(width: number, height: number, paint: (x: number, y: number) => Rgb) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: RGB
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // no filter
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x, y);
      const at = y * stride + 1 + x * 3;
      raw[at] = r;
      raw[at + 1] = g;
      raw[at + 2] = b;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A stable, mid-dark colour for a string. */
export function colourFor(key: string): Rgb {
  const hue = crc32(key) % 360;
  const [r, g, b] = hslToRgb(hue / 360, 0.45, 0.42);
  return [r, g, b];
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    const v =
      u < 1 / 6
        ? p + (q - p) * 6 * u
        : u < 1 / 2
          ? q
          : u < 2 / 3
            ? p + (q - p) * (2 / 3 - u) * 6
            : p;
    return Math.round(v * 255);
  };
  return [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)];
}

const darker = ([r, g, b]: Rgb, by: number): Rgb => [r * by, g * by, b * by].map(Math.round) as Rgb;

/** A card-shaped placeholder, 63 × 88 like the real thing. */
export function cardPlaceholder(key: string, size: 'small' | 'large'): Buffer {
  const width = size === 'small' ? 245 : 490;
  const height = Math.round((width * 88) / 63);
  const base = colourFor(key);
  const art = darker(base, 0.6);
  const border = Math.round(width * 0.05);
  const artTop = Math.round(height * 0.12);
  const artBottom = Math.round(height * 0.52);
  return encodePng(width, height, (x, y) => {
    if (x < border || x >= width - border || y < border || y >= height - border)
      return [238, 214, 90];
    if (y >= artTop && y < artBottom && x >= border * 2 && x < width - border * 2) return art;
    return base;
  });
}

/** A square avatar placeholder: a filled circle on transparent-looking dark. */
export function avatarPlaceholder(id: number): Buffer {
  const size = 256;
  const fill = colourFor(`avatar-${id}`);
  const r = size / 2;
  return encodePng(size, size, (x, y) =>
    (x - r) ** 2 + (y - r) ** 2 < (r * 0.8) ** 2 ? fill : [30, 34, 46],
  );
}
