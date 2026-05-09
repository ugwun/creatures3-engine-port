#ifndef MNG_FORMAT_H
#define MNG_FORMAT_H

// MNG file format utilities — standalone header for parsing MNG music files
// and reconstructing WAV data from embedded voice samples.
//
// MNG files bundle a script and multiple WAV voice samples.  The header
// contains an index table; each voice's raw data is a WAV with the first
// 16 bytes stripped (RIFF tag, file size, WAVE tag, fmt tag).
//
// This header has no SDL or engine dependencies so it can be unit-tested.

#include <cstdio>
#include <cstring>

// Result of reading a voice entry from an MNG header.
struct MNGVoiceEntry {
  int offset; // Byte offset within the MNG file to the voice data
  int size;   // Size of the raw voice data (without RIFF/WAVE/fmt headers)
  bool valid; // Whether the read succeeded
};

// Read the offset and size of a voice sample from the MNG file header.
//
// MNG header layout:
//   int total_voices
//   int script_offset, int script_size
//   int voice0_offset, int voice0_size
//   int voice1_offset, int voice1_size
//   ...
//
// Returns a MNGVoiceEntry with valid=false if fp is NULL, the seek/read
// fails, or the returned offset/size are non-positive.
inline MNGVoiceEntry MNGReadVoiceEntry(FILE *fp, unsigned int index) {
  MNGVoiceEntry result = {0, 0, false};
  if (!fp)
    return result;

  // Read total_voices to bounds-check
  int totalVoices = 0;
  if (fseek(fp, 0, SEEK_SET) != 0)
    return result;
  if (fread(&totalVoices, sizeof(int), 1, fp) != 1)
    return result;
  if ((int)index >= totalVoices)
    return result;

  // Seek to the offset/size pair for this voice:
  //   skip total_voices (1 int) + script_offset (1 int) + script_size (1 int)
  //   = 3 ints, then index * 2 ints for previous voices
  long headerPos = (long)((3 + index * 2) * sizeof(int));
  if (fseek(fp, headerPos, SEEK_SET) != 0)
    return result;

  if (fread(&result.offset, sizeof(int), 1, fp) != 1)
    return result;
  if (fread(&result.size, sizeof(int), 1, fp) != 1)
    return result;

  if (result.offset <= 0 || result.size <= 0) {
    result.valid = false;
    return result;
  }

  result.valid = true;
  return result;
}

// Reconstruct a valid WAV file from raw MNG voice data.
//
// MNG voice data has the first 16 bytes of a standard WAV stripped:
//   "RIFF" (4) + file_size (4) + "WAVE" (4) + "fmt " (4) = 16 bytes
//
// This function prepends those 16 bytes to produce a complete WAV.
//
// Parameters:
//   rawData   - pointer to raw voice data from the MNG file
//   rawSize   - size of rawData in bytes
//   outBuf    - output buffer (must be at least rawSize + 16 bytes)
//   outSize   - set to the total WAV size (rawSize + 16)
//
// Returns true on success, false if rawData is NULL or rawSize <= 0.
inline bool MNGReconstructWAV(const unsigned char *rawData, int rawSize,
                              unsigned char *outBuf, int &outSize) {
  if (!rawData || rawSize <= 0 || !outBuf)
    return false;

  outSize = 16 + rawSize;

  // RIFF header
  memcpy(outBuf, "RIFF", 4);
  int riffSize = outSize - 8; // total size minus "RIFF" and size field
  memcpy(outBuf + 4, &riffSize, 4);
  memcpy(outBuf + 8, "WAVE", 4);
  memcpy(outBuf + 12, "fmt ", 4);

  // Append the raw voice data (starts with fmt header_size field)
  memcpy(outBuf + 16, rawData, rawSize);

  return true;
}

#endif // MNG_FORMAT_H
