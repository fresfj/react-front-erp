import type { DocumentReference, CollectionReference } from 'firebase/firestore';

import { doc, collection } from 'firebase/firestore';

import { FIRESTORE } from 'src/lib/firebase';

// ----------------------------------------------------------------------

const ENTERPRISES = 'enterprises';

export type EnterpriseCollectionName = 'suppliers' | 'products' | 'members';

export function enterpriseDoc(enterpriseId: string): DocumentReference {
  return doc(FIRESTORE, ENTERPRISES, enterpriseId);
}

export function enterpriseCollection(
  enterpriseId: string,
  name: EnterpriseCollectionName
): CollectionReference {
  return collection(FIRESTORE, ENTERPRISES, enterpriseId, name);
}