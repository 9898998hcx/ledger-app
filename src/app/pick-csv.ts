/**
 * 选择并读取 CSV 文件（返回字节，供编码自动识别使用）。
 * Web 用 File/blob，移动端用 expo-file-system legacy 读取 base64 再转字节。
 */

import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';
import { base64ToBytes } from '../domain/bytes';

export interface PickedCsvFile {
  name: string;
  bytes: Uint8Array;
}

export async function pickCsvFile(types?: string[]): Promise<PickedCsvFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type:
      types && types.length > 0
        ? types
        : ['text/csv', 'text/plain', 'application/vnd.ms-excel', 'application/octet-stream', '*/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) return null;
  const asset = result.assets[0];

  if (Platform.OS === 'web') {
    const maybeFile = (asset as unknown as { file?: File }).file;
    if (maybeFile) {
      return { name: asset.name, bytes: new Uint8Array(await maybeFile.arrayBuffer()) };
    }
    const resp = await fetch(asset.uri);
    return { name: asset.name, bytes: new Uint8Array(await resp.arrayBuffer()) };
  }

  const legacy = await import('expo-file-system/legacy');
  const base64 = await legacy.readAsStringAsync(asset.uri, {
    encoding: legacy.EncodingType.Base64,
  });
  return { name: asset.name, bytes: base64ToBytes(base64) };
}
