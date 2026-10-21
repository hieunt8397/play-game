// The subset of free-tex-packer-core 0.3.9 used by tools/atlas/pack.ts. The package's own
// index.d.ts declares an ambient module inside a module file, which does not type a default import,
// so pack.ts loads it with createRequire and these types.

export interface PackFile {
  /** Relative path; becomes the frame name (folder kept, extension removed). */
  path: string;
  contents: Buffer;
}

export interface PackResult {
  name: string;
  buffer: Buffer;
}

export interface PackOptions {
  textureName: string;
  width: number;
  height: number;
  fixedSize: boolean;
  powerOfTwo: boolean;
  padding: number;
  allowRotation: boolean;
  allowTrim: boolean;
  detectIdentical: boolean;
  removeFileExtension: boolean;
  prependFolderName: boolean;
  exporter: 'JsonHash';
}
