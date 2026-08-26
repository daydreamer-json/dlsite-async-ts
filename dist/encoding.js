/** Encoding helpers usable across runtimes (no Buffer dependency). */
/** Encode bytes as base64. */
export function bytesToBase64(bytes) {
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
}
/** Decode base64 into bytes. */
export function base64ToBytes(base64) {
    const binary = atob(base64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        out[i] = binary.charCodeAt(i);
    }
    return out;
}
/** Decode a hex string into bytes. */
export function hexToBytes(hex) {
    if (hex.length % 2 !== 0) {
        throw new Error("Invalid hex string");
    }
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i += 1) {
        const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
        if (Number.isNaN(byte)) {
            throw new Error("Invalid hex string");
        }
        out[i] = byte;
    }
    return out;
}
/** Generate an RSA-OAEP (SHA-256) key pair for viewer token exchange. */
export async function generateRsaKeyPair() {
    const keyPair = await crypto.subtle.generateKey({
        name: "RSA-OAEP",
        modulusLength: 4096,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
    }, true, ["decrypt"]);
    return keyPair;
}
/** Export the public key as base64-encoded SPKI DER. */
export async function spkiBase64(publicKey) {
    const spki = await crypto.subtle.exportKey("spki", publicKey);
    return bytesToBase64(new Uint8Array(spki));
}
/** Decrypt RSA-OAEP (SHA-256) ciphertext. */
export async function rsaOaepDecrypt(privateKey, ciphertext) {
    const plaintext = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey, ciphertext);
    return new Uint8Array(plaintext);
}
//# sourceMappingURL=encoding.js.map