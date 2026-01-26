declare module "pdf-parse" {
  // Minimal types for our server-side usage.
  const pdfParse: (input: Buffer | Uint8Array, options?: unknown) => Promise<{ text?: string }>;
  export default pdfParse;
}

