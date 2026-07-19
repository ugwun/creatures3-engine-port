// BenC 30Dec99

#ifndef FILEFUNCS_H
#define FILEFUNCS_H

#include <stddef.h>

// win32 replacements
bool DeleteFile( const char* filename );
bool MoveFile( const char* src, const char* dest );
bool CopyFile( const char* src, const char* dest, bool overwrite );
void CreateDirectory(const char* name, void* ignored);


// returns true if file exists
bool FileExists( const char* filename );

// Like FileExists, but fixes the filename in-place on Linux when the
// case doesn't match. Pass a mutable buffer and its size.
bool FileExistsMutable( char* filename, size_t bufLen );

#ifdef __linux__
// Resolve case-insensitive filename on Linux ext4.
// Modifies buf in-place. Returns true if a match was found.
bool ResolveCaseInsensitive(char *buf, size_t bufLen);
#endif


#endif // FILEFUNCS_H

