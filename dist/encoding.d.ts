/** Encoding helpers usable across runtimes (no Buffer dependency). */
/** Encode bytes as base64. */
export declare function bytesToBase64(bytes: Uint8Array): string;
/** Decode base64 into bytes. */
export declare function base64ToBytes(base64: string): Uint8Array<ArrayBuffer>;
/** Decode a hex string into bytes. */
export declare function hexToBytes(hex: string): Uint8Array<ArrayBuffer>;
/** Generate an RSA-OAEP (SHA-256) key pair for viewer token exchange. */
export declare function generateRsaKeyPair(): Promise<CryptoKeyPair>;
/** Export the public key as base64-encoded SPKI DER. */
export declare function spkiBase64(publicKey: CryptoKey): Promise<string>;
/** Decrypt RSA-OAEP (SHA-256) ciphertext. */
export declare function rsaOaepDecrypt(privateKey: CryptoKey, ciphertext: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>>;
//# sourceMappingURL=encoding.d.ts.map