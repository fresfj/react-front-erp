import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

import { compressImageForUpload } from 'src/utils/image-compress';

import { STORAGE } from 'src/lib/firebase';

// ----------------------------------------------------------------------

const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

export async function uploadMemberAvatar(
  enterpriseId: string,
  uid: string,
  file: File
): Promise<string> {
  const compressed = await compressImageForUpload(file, 'avatar');
  const path = `enterprises/${enterpriseId}/members/${uid}/avatar.${compressed.extension}`;
  const storageRef = ref(STORAGE, path);
  await uploadBytes(storageRef, compressed.blob, {
    contentType: compressed.contentType,
    cacheControl: IMMUTABLE_CACHE_CONTROL,
  });
  return getDownloadURL(storageRef);
}

export async function uploadProductImage(
  enterpriseId: string,
  skuOrId: string,
  file: File
): Promise<string> {
  const compressed = await compressImageForUpload(file, 'product');
  const safeKey = skuOrId.replace(/[^a-zA-Z0-9-_]/g, '-');
  const path = `enterprises/${enterpriseId}/products/${safeKey}.${compressed.extension}`;
  const storageRef = ref(STORAGE, path);
  await uploadBytes(storageRef, compressed.blob, {
    contentType: compressed.contentType,
    cacheControl: IMMUTABLE_CACHE_CONTROL,
  });
  return getDownloadURL(storageRef);
}

export async function uploadStoreLogo(
  enterpriseId: string,
  file: File
): Promise<string> {
  const compressed = await compressImageForUpload(file, 'storeLogo');
  const path = `enterprises/${enterpriseId}/store/logo.${compressed.extension}`;
  const storageRef = ref(STORAGE, path);
  await uploadBytes(storageRef, compressed.blob, {
    contentType: compressed.contentType,
    cacheControl: IMMUTABLE_CACHE_CONTROL,
  });
  return getDownloadURL(storageRef);
}

export async function uploadStoreBanner(
  enterpriseId: string,
  file: File
): Promise<string> {
  const compressed = await compressImageForUpload(file, 'storeBanner');
  const path = `enterprises/${enterpriseId}/store/banner.${compressed.extension}`;
  const storageRef = ref(STORAGE, path);
  await uploadBytes(storageRef, compressed.blob, {
    contentType: compressed.contentType,
    cacheControl: IMMUTABLE_CACHE_CONTROL,
  });
  return getDownloadURL(storageRef);
}
