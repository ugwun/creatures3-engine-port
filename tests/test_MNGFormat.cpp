#include <gtest/gtest.h>

#include "engine/Sound/MNGFormat.h"
#include <cstdio>
#include <cstring>
#include <vector>

// Helper: create a minimal MNG file in /tmp with the given number of voices.
// Each voice gets a sequential offset and size stored in the header.
// Voice data is filled with a recognizable pattern.
static std::string CreateTestMNG(int numVoices,
                                 const std::vector<int> &offsets,
                                 const std::vector<int> &sizes,
                                 int scriptOffset = 100,
                                 int scriptSize = 50) {
  static int counter = 0;
  char path[256];
  snprintf(path, sizeof(path), "/tmp/test_mng_%d_%d.mng", getpid(),
           counter++);

  FILE *fp = fopen(path, "wb");
  if (!fp)
    return "";

  // Write header: total_voices, script_offset, script_size,
  // then pairs of (offset, size) for each voice
  fwrite(&numVoices, sizeof(int), 1, fp);
  fwrite(&scriptOffset, sizeof(int), 1, fp);
  fwrite(&scriptSize, sizeof(int), 1, fp);

  for (int i = 0; i < numVoices; i++) {
    fwrite(&offsets[i], sizeof(int), 1, fp);
    fwrite(&sizes[i], sizeof(int), 1, fp);
  }

  // Write voice data at each offset
  for (int i = 0; i < numVoices; i++) {
    // Pad to reach the offset
    long currentPos = ftell(fp);
    if (currentPos < offsets[i]) {
      int pad = offsets[i] - (int)currentPos;
      std::vector<unsigned char> padding(pad, 0);
      fwrite(padding.data(), 1, pad, fp);
    }
    // Write recognizable pattern: bytes filled with (i + 0x10)
    std::vector<unsigned char> data(sizes[i], (unsigned char)(i + 0x10));
    fwrite(data.data(), 1, sizes[i], fp);
  }

  fclose(fp);
  return std::string(path);
}

// Helper: clean up test files
static void RemoveTestFile(const std::string &path) {
  if (!path.empty())
    unlink(path.c_str());
}

// =========================================================================
// MNGReadVoiceEntry tests
// =========================================================================

TEST(MNGFormatTest, ReadVoiceEntry_ValidSingleVoice) {
  std::vector<int> offsets = {200};
  std::vector<int> sizes = {1024};
  std::string path = CreateTestMNG(1, offsets, sizes);
  ASSERT_FALSE(path.empty());

  FILE *fp = fopen(path.c_str(), "rb");
  ASSERT_NE(fp, nullptr);

  MNGVoiceEntry entry = MNGReadVoiceEntry(fp, 0);
  fclose(fp);
  RemoveTestFile(path);

  EXPECT_TRUE(entry.valid);
  EXPECT_EQ(entry.offset, 200);
  EXPECT_EQ(entry.size, 1024);
}

TEST(MNGFormatTest, ReadVoiceEntry_MultipleVoices) {
  std::vector<int> offsets = {500, 2000, 5000};
  std::vector<int> sizes = {100, 200, 300};
  std::string path = CreateTestMNG(3, offsets, sizes);
  ASSERT_FALSE(path.empty());

  FILE *fp = fopen(path.c_str(), "rb");
  ASSERT_NE(fp, nullptr);

  // Check each voice
  MNGVoiceEntry e0 = MNGReadVoiceEntry(fp, 0);
  EXPECT_TRUE(e0.valid);
  EXPECT_EQ(e0.offset, 500);
  EXPECT_EQ(e0.size, 100);

  MNGVoiceEntry e1 = MNGReadVoiceEntry(fp, 1);
  EXPECT_TRUE(e1.valid);
  EXPECT_EQ(e1.offset, 2000);
  EXPECT_EQ(e1.size, 200);

  MNGVoiceEntry e2 = MNGReadVoiceEntry(fp, 2);
  EXPECT_TRUE(e2.valid);
  EXPECT_EQ(e2.offset, 5000);
  EXPECT_EQ(e2.size, 300);

  fclose(fp);
  RemoveTestFile(path);
}

TEST(MNGFormatTest, ReadVoiceEntry_IndexOutOfRange) {
  std::vector<int> offsets = {200};
  std::vector<int> sizes = {100};
  std::string path = CreateTestMNG(1, offsets, sizes);
  ASSERT_FALSE(path.empty());

  FILE *fp = fopen(path.c_str(), "rb");
  ASSERT_NE(fp, nullptr);

  // Index 1 is out of range for a 1-voice MNG
  MNGVoiceEntry entry = MNGReadVoiceEntry(fp, 1);
  EXPECT_FALSE(entry.valid);

  // Very large index
  MNGVoiceEntry entry2 = MNGReadVoiceEntry(fp, 9999);
  EXPECT_FALSE(entry2.valid);

  fclose(fp);
  RemoveTestFile(path);
}

TEST(MNGFormatTest, ReadVoiceEntry_NullFile) {
  MNGVoiceEntry entry = MNGReadVoiceEntry(nullptr, 0);
  EXPECT_FALSE(entry.valid);
}

TEST(MNGFormatTest, ReadVoiceEntry_ZeroVoices) {
  // Create a file with 0 voices
  char path[256];
  snprintf(path, sizeof(path), "/tmp/test_mng_zero_%d.mng", getpid());
  FILE *fp = fopen(path, "wb");
  ASSERT_NE(fp, nullptr);
  int zero = 0;
  fwrite(&zero, sizeof(int), 1, fp); // total_voices = 0
  int dummy = 100;
  fwrite(&dummy, sizeof(int), 1, fp); // script offset
  fwrite(&dummy, sizeof(int), 1, fp); // script size
  fclose(fp);

  fp = fopen(path, "rb");
  ASSERT_NE(fp, nullptr);
  MNGVoiceEntry entry = MNGReadVoiceEntry(fp, 0);
  EXPECT_FALSE(entry.valid);
  fclose(fp);
  unlink(path);
}

// =========================================================================
// MNGReconstructWAV tests
// =========================================================================

TEST(MNGFormatTest, ReconstructWAV_ValidHeader) {
  // Simulate raw MNG voice data (what would follow after stripped headers)
  // A minimal fmt chunk: header_size=16, PCM format, 1 chan, 22050 Hz, etc.
  unsigned char rawData[28];
  int headerSize = 16;
  memcpy(rawData, &headerSize, 4);      // fmt header size
  short format = 1;                      // PCM
  memcpy(rawData + 4, &format, 2);      // wFormatTag
  short channels = 1;
  memcpy(rawData + 6, &channels, 2);    // nChannels
  int sampleRate = 22050;
  memcpy(rawData + 8, &sampleRate, 4);  // nSamplesPerSec
  int avgBytes = 22050;
  memcpy(rawData + 12, &avgBytes, 4);   // nAvgBytesPerSec
  short blockAlign = 1;
  memcpy(rawData + 16, &blockAlign, 2); // nBlockAlign
  short bitsPerSample = 8;
  memcpy(rawData + 18, &bitsPerSample, 2); // wBitsPerSample
  memcpy(rawData + 20, "data", 4);      // data chunk tag
  int dataSize = 4;
  memcpy(rawData + 24, &dataSize, 4);   // data size

  unsigned char outBuf[44];
  int outSize = 0;

  bool ok = MNGReconstructWAV(rawData, 28, outBuf, outSize);
  EXPECT_TRUE(ok);
  EXPECT_EQ(outSize, 44); // 16 header + 28 raw

  // Verify RIFF header
  EXPECT_EQ(memcmp(outBuf, "RIFF", 4), 0);
  int riffSize;
  memcpy(&riffSize, outBuf + 4, 4);
  EXPECT_EQ(riffSize, 36); // 44 - 8

  EXPECT_EQ(memcmp(outBuf + 8, "WAVE", 4), 0);
  EXPECT_EQ(memcmp(outBuf + 12, "fmt ", 4), 0);
}

TEST(MNGFormatTest, ReconstructWAV_DataIntegrity) {
  // Fill raw data with a known pattern
  unsigned char rawData[100];
  for (int i = 0; i < 100; i++)
    rawData[i] = (unsigned char)(i & 0xFF);

  unsigned char outBuf[116];
  int outSize = 0;

  bool ok = MNGReconstructWAV(rawData, 100, outBuf, outSize);
  EXPECT_TRUE(ok);
  EXPECT_EQ(outSize, 116);

  // The raw data should appear verbatim at offset 16
  EXPECT_EQ(memcmp(outBuf + 16, rawData, 100), 0);
}

TEST(MNGFormatTest, ReconstructWAV_NullInput) {
  unsigned char outBuf[32];
  int outSize = 0;

  EXPECT_FALSE(MNGReconstructWAV(nullptr, 10, outBuf, outSize));
  EXPECT_FALSE(MNGReconstructWAV((unsigned char *)"x", 0, outBuf, outSize));
  EXPECT_FALSE(MNGReconstructWAV((unsigned char *)"x", -1, outBuf, outSize));
  EXPECT_FALSE(MNGReconstructWAV((unsigned char *)"x", 10, nullptr, outSize));
}

// =========================================================================
// Integration: read voice from MNG, reconstruct WAV, verify structure
// =========================================================================

TEST(MNGFormatTest, EndToEnd_ReadAndReconstruct) {
  // Create an MNG with one voice containing a recognizable pattern
  const int voiceSize = 64;
  const int voiceOffset = 200;
  std::vector<int> offsets = {voiceOffset};
  std::vector<int> sizes = {voiceSize};
  std::string path = CreateTestMNG(1, offsets, sizes);
  ASSERT_FALSE(path.empty());

  // Read the voice entry
  FILE *fp = fopen(path.c_str(), "rb");
  ASSERT_NE(fp, nullptr);

  MNGVoiceEntry entry = MNGReadVoiceEntry(fp, 0);
  ASSERT_TRUE(entry.valid);
  ASSERT_EQ(entry.offset, voiceOffset);
  ASSERT_EQ(entry.size, voiceSize);

  // Read the raw data
  fseek(fp, entry.offset, SEEK_SET);
  std::vector<unsigned char> rawData(entry.size);
  size_t bytesRead = fread(rawData.data(), 1, entry.size, fp);
  fclose(fp);
  RemoveTestFile(path);
  ASSERT_EQ((int)bytesRead, entry.size);

  // Verify raw data has our pattern (filled with 0x10)
  for (int i = 0; i < voiceSize; i++)
    EXPECT_EQ(rawData[i], 0x10);

  // Reconstruct WAV
  std::vector<unsigned char> wavBuf(entry.size + 16);
  int wavSize = 0;
  bool ok = MNGReconstructWAV(rawData.data(), entry.size, wavBuf.data(),
                              wavSize);
  ASSERT_TRUE(ok);
  EXPECT_EQ(wavSize, voiceSize + 16);

  // Verify RIFF/WAVE/fmt structure
  EXPECT_EQ(memcmp(wavBuf.data(), "RIFF", 4), 0);
  EXPECT_EQ(memcmp(wavBuf.data() + 8, "WAVE", 4), 0);
  EXPECT_EQ(memcmp(wavBuf.data() + 12, "fmt ", 4), 0);

  // Verify raw data integrity after header
  EXPECT_EQ(memcmp(wavBuf.data() + 16, rawData.data(), voiceSize), 0);
}
