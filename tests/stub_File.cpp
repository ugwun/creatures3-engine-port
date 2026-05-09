// stub_File.cpp
// Minimal no-op stub for the File class, used by tests that compile Genome.cpp.
// Genome only calls File::Create() and File::Write() in WriteToFile(),
// which is never exercised by the Genome unit tests (they use raw byte
// arrays, not disk files).
// All methods throw immediately if called — this keeps the tests honest.

#include "engine/File.h"
#include <string>

File::File(const std::string &name, uint32, uint32)
    : myDiskFileHandle(INVALID_HANDLE_VALUE), myName(name) {}

void File::Open(const std::string &name, uint32, uint32) {
  myName = name;
  throw FileException("stub: File::Open not implemented in tests", __LINE__);
}

void File::Create(const std::string &name, uint32, uint32) {
  myName = name;
  throw FileException("stub: File::Create not implemented in tests", __LINE__);
}

void File::Close() {
  if (myDiskFileHandle != INVALID_HANDLE_VALUE) {
    close(myDiskFileHandle);
    myDiskFileHandle = INVALID_HANDLE_VALUE;
  }
}

int32 File::Seek(int32 moveBy, FilePosition from) {
  return lseek(myDiskFileHandle, moveBy, from);
}

int32 File::SeekToBegin() { return Seek(0, Start); }

uint32 File::GetSize() {
  off_t cur = lseek(myDiskFileHandle, 0, SEEK_CUR);
  off_t end = lseek(myDiskFileHandle, 0, SEEK_END);
  lseek(myDiskFileHandle, cur, SEEK_SET);
  return (uint32)end;
}

bool File::FileExists(std::string &filename) {
  return access(filename.c_str(), F_OK) == 0;
}

void File::Read(std::string &str) {
  throw FileException("stub: File::Read(string) not implemented", __LINE__);
}

void File::Write(std::string str) {
  throw FileException("stub: File::Write(string) not implemented", __LINE__);
}
