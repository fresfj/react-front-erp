import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

import { STORAGE } from 'src/lib/firebase';

// ----------------------------------------------------------------------

export async function uploadMemberAvatar(
  enterpriseId: string,
  uid: string,
  file: File
): Promise<string> {
  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg';
  const path = `enterprises/${enterpriseId}/members/${uid}/avatar.${ext}`;
  const storageRef = ref(STORAGE, path);
  await uploadBytes(storageRef, file, { contentType: file.type || 'image/jpeg' });
  return getDownloadURL(storageRef);
}
