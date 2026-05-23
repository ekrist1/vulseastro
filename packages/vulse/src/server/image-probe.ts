/** Returns {width,height} from image headers without decoding the full file. */
export function probeDimensions(buf: ArrayBuffer, mime: string): { width: number; height: number } | null {
  const v = new DataView(buf)
  if (mime === 'image/png') {
    if (v.byteLength < 24) return null
    return { width: v.getUint32(16), height: v.getUint32(20) }
  }
  if (mime === 'image/jpeg') {
    let i = 2
    while (i < v.byteLength) {
      if (v.getUint8(i) !== 0xff) return null
      const marker = v.getUint8(i + 1)
      const len = v.getUint16(i + 2)
      if ((marker >= 0xc0 && marker <= 0xcf) && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: v.getUint16(i + 5), width: v.getUint16(i + 7) }
      }
      i += 2 + len
    }
    return null
  }
  if (mime === 'image/webp') {
    if (v.byteLength < 30) return null
    if (String.fromCharCode(v.getUint8(12), v.getUint8(13), v.getUint8(14), v.getUint8(15)) === 'VP8L') {
      const b0 = v.getUint8(21)
      const b1 = v.getUint8(22)
      const b2 = v.getUint8(23)
      const b3 = v.getUint8(24)
      const width = 1 + (((b1 & 0x3f) << 8) | b0)
      const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6))
      return { width, height }
    }
    return null
  }
  return null
}
