// --------------------------------------------------------------------------
// Filename:	MemoryMappedFile.cpp
// Class:		MemoryMappedFile
// Purpose:		Allows client to map to a file on disk or map to part
//				of an already existing memory mapped file.
//
// Description:
//				note myFileData can be moved to the relevant
// part of the 				memory mapped view e.g. in a composite
// file like creature 				gallery I like to skip the
// offset and moniker key. 				However
// myConstantPtrToViewOfFile will _always_ point to
// the start of the file mapping.  Always use this pointer to
// unmap the file.
//
// History:
// --------------------------------------------------------------------------

#include "MemoryMappedFile.h"
// #include "ErrorMessageHandler.h"

#include <fcntl.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <unistd.h>

MemoryMappedFile::MemoryMappedFile()
    : myFile(0), myLength(0), myBasePtr(NULL), myPosition(0) {}

MemoryMappedFile::MemoryMappedFile(const std::string &filename,
                                   uint32 desiredAccessFlags,
                                   uint32 sharemodeFlags)
    : myFile(0), myLength(0), myBasePtr(NULL), myPosition(0) {
  Open(filename, desiredAccessFlags, sharemodeFlags);
}

void MemoryMappedFile::Open(
    const std::string &filename,
    uint32 desiredAccessFlags, // =GENERIC_READ|GENERIC_WRITE
    uint32 sharemodeFlags,     // =FILE_SHARE_READ|FILE_SHARE_WRITE
    uint32 fileSize)           // =0
{
  // open the file

  ASSERT(myFile == 0); // don't allow reopening.
  myFilename = filename;

  int oflags = 0;

  if ((desiredAccessFlags & GENERIC_READ) &&
      (desiredAccessFlags & GENERIC_WRITE)) {
    oflags |= O_RDWR;
  } else if (desiredAccessFlags & GENERIC_READ)
    oflags |= O_RDONLY;
  else if (desiredAccessFlags & GENERIC_WRITE)
    oflags |= O_WRONLY;

  myFile = open(filename.c_str(), oflags, S_IREAD | S_IWRITE);
  if (myFile == -1) {
    throw MemoryMappedFileException(
        "MemoryMappedFile::Open() - open failed: " + filename, __LINE__);
  }

  if (fileSize == 0) {
    // get size of entire file
    struct stat inf;
    if (fstat(myFile, &inf) != 0) {
      close(myFile);
      throw MemoryMappedFileException("MemoryMappedFile::Open() - fstat failed",
                                      __LINE__);
    }
    myLength = (uint32)inf.st_size;
  } else {
    myLength = fileSize;
    // Ensure the file is large enough for the requested mapping.
    // On Windows, CreateFileMapping auto-grows the file; on POSIX we
    // need ftruncate to extend it before mmap.
    struct stat inf;
    if (fstat(myFile, &inf) == 0 && (uint32)inf.st_size < myLength) {
      if (ftruncate(myFile, myLength) != 0) {
        close(myFile);
        throw MemoryMappedFileException(
            "MemoryMappedFile::Open() - ftruncate failed", __LINE__);
      }
    }
  }

  // map it into memory

  int flags = MAP_SHARED; // or MAP_PRIVATE?
  int prot = 0;
  if (desiredAccessFlags & GENERIC_WRITE)
    prot |= PROT_WRITE;
  if (desiredAccessFlags & GENERIC_READ)
    prot |= PROT_READ;

  myBasePtr = (uint8 *)mmap(0, myLength, prot, flags, myFile, 0);

  if (myBasePtr == MAP_FAILED) {
    myBasePtr = NULL;
    close(myFile);
    throw MemoryMappedFileException("MemoryMappedFile::Open() - mmap failed",
                                    __LINE__);
  }
  myPosition = 0;
}

MemoryMappedFile::~MemoryMappedFile() { Close(); }

void MemoryMappedFile::Close() {
  if (myBasePtr && myLength > 0) {
    munmap(myBasePtr, myLength);
    myBasePtr = NULL;
    myLength = 0;
  }

  if (myFile) {
    close(myFile);
    myFile = 0;
  }
  myPosition = 0;
}

void MemoryMappedFile::Seek(int32 moveBy, File::FilePosition from) {

  uint32 newpos;
  switch (from) {
  case (File::Start): {
    newpos = moveBy;
    break;
  }

  case (File::Current): {
    newpos =
        myPosition +
        moveBy; // FIXED: was `newpos += moveBy` where newpos was uninitialized
    break;
  }
  case (File::End): {
    newpos = myLength - moveBy;
    break;
  }
  }

  // allowed to point to last+1
  if (newpos > myLength) {
    char buf[256];
    snprintf(buf, sizeof(buf),
             "MemoryMappedFile::Seek() - out of range: "
             "requested=%u length=%u from=%d moveBy=%d curPos=%u",
             newpos, myLength, (int)from, moveBy, myPosition);
    std::string msg = std::string(buf) + " file=" + myFilename;
    throw MemoryMappedFileException(msg, __LINE__);
  }

  myPosition = newpos;
}

uint8 *MemoryMappedFile::GetFileStart() { return myBasePtr; }
uint32 MemoryMappedFile::GetPosition() { return myPosition; }
uint32 MemoryMappedFile::GetLength() { return myLength; }
void MemoryMappedFile::Reset() { myPosition = 0; }
bool MemoryMappedFile::Valid() { return myBasePtr != NULL; }
