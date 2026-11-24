/**
 * Images for The Analyst (D-094): pick from Photos or paste from the clipboard, then shrink to
 * at most 1568 points on the long edge (what the model reads best) as a JPEG, as base64.
 */
import * as Clipboard from 'expo-clipboard';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

export type Attachment = { uri: string; mediaType: 'image/jpeg'; data: string };

const LONG_EDGE = 1568;

async function shrink(uri: string, width?: number, height?: number): Promise<Attachment | null> {
  try {
    const ctx = ImageManipulator.manipulate(uri);
    if (width && height && Math.max(width, height) > LONG_EDGE) {
      ctx.resize(width >= height ? { width: LONG_EDGE } : { height: LONG_EDGE });
    }
    const img = await ctx.renderAsync();
    const out = await img.saveAsync({ base64: true, compress: 0.7, format: SaveFormat.JPEG });
    return out.base64 ? { uri: out.uri, mediaType: 'image/jpeg', data: out.base64 } : null;
  } catch {
    return null;
  }
}

export async function pickImages(max: number): Promise<Attachment[]> {
  if (max <= 0) return [];
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: max, quality: 1 });
  if (res.canceled) return [];
  const out = await Promise.all(res.assets.slice(0, max).map((a) => shrink(a.uri, a.width, a.height)));
  return out.filter((a): a is Attachment => !!a);
}

export async function clipboardHasImage(): Promise<boolean> {
  try {
    return await Clipboard.hasImageAsync();
  } catch {
    return false;
  }
}

export async function pasteImage(): Promise<Attachment | null> {
  const img = await Clipboard.getImageAsync({ format: 'png' });
  if (!img?.data) return null;
  return shrink(img.data, img.size?.width, img.size?.height);
}
