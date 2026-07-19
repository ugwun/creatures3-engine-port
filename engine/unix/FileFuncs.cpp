// BenC 30Dec99


#include "FileFuncs.h"

#include <stdio.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <sys/mman.h>

#ifdef __linux__
#include <cstring>
#include <dirent.h>
#include <strings.h>

// Case-insensitive file resolution for Linux.
// On macOS/Windows, filesystems are case-insensitive, so "Chars.S16" matches
// "chars.s16". On Linux ext4, they don't. This function scans the parent
// directory for a case-insensitive match and writes the corrected path back
// into the mutable buffer so subsequent open()/stat() calls use the right name.
// Returns true if a match was found (and buf was updated), false otherwise.
bool ResolveCaseInsensitive(char *buf, size_t bufLen) {
  // Split into directory and basename
  char *lastSlash = strrchr(buf, '/');
  if (!lastSlash)
    return false;

  // Temporarily null-terminate to get the directory
  *lastSlash = '\0';
  const char *dir = buf;
  const char *baseName = lastSlash + 1;

  DIR *d = opendir(dir);
  if (!d) {
    *lastSlash = '/'; // restore
    return false;
  }

  bool found = false;
  struct dirent *ent;
  while ((ent = readdir(d)) != NULL) {
    if (strcasecmp(ent->d_name, baseName) == 0) {
      // Found a case-insensitive match — fix up the path
      *lastSlash = '/';
      size_t nameLen = strlen(ent->d_name);
      size_t dirLen = lastSlash - buf + 1;
      if (dirLen + nameLen < bufLen) {
        memcpy(lastSlash + 1, ent->d_name, nameLen + 1);
        found = true;
      }
      break;
    }
  }

  if (!found)
    *lastSlash = '/'; // restore if we didn't find a match

  closedir(d);
  return found;
}
#endif


// win32 replacement
bool DeleteFile( const char* filename )
{
	int i=unlink( filename );
	return i==0 ? true:false;
}



// win32 replacement
// hmmm... thought there would be a better way...
bool CopyFile( const char* src, const char* dest, bool overwrite )
{
	int infd = -1;
	int outfd = -1;
	void* p = NULL;
	struct stat statbuf;
	bool success = false;	// positive attitude.
	int flags;

	// open input file and map it into memory
	infd = open( src, O_RDONLY );
	if( infd == -1 )
		goto cleanup;

	if( fstat( infd, &statbuf ) != 0 )
		goto cleanup;

	p = mmap( 0, statbuf.st_size, PROT_READ, MAP_PRIVATE, infd, 0 );
	if( p == MAP_FAILED )
		goto cleanup;


	// create output file
	flags = O_CREAT|O_WRONLY;
	if( overwrite )
		flags |= O_TRUNC;
	else
		flags |= O_EXCL;	// fail if file exists

	outfd = open( dest, O_WRONLY );
	if( outfd == -1 )
		goto cleanup;

	// blam.
	if( write( outfd, p, statbuf.st_size ) == statbuf.st_size )
		success = true; 


cleanup:
	if( outfd != -1 )
		close( outfd );
	if( p )
		munmap( p, statbuf.st_size );
	if( infd != -1 )
		close( infd );

	return success;
}

void CreateDirectory(const char* name, void* ignored)
{
	int i = mkdir(name,0xffff);	
}


// win32 replacement
bool MoveFile( const char* src, const char* dest )
{
	int i = rename( src, dest );
	return i==0 ? true:false;
}



bool FileExists( const char* filename )
{
	struct stat buf;
	int i = stat( filename, &buf );
#ifdef __linux__
	if (i != 0) {
		// Case-insensitive fallback: the game was developed for Windows/macOS
		// where filesystems are case-insensitive. On Linux, "Chars.S16" !=
		// "chars.s16". Scan the directory for a case-insensitive match.
		// We fix up a mutable copy and re-stat; the caller's buffer is const
		// so we can't fix it in place here — see FileExistsMutable() below.
		char resolved[4096];
		size_t len = strlen(filename);
		if (len > 0 && len < sizeof(resolved)) {
			memcpy(resolved, filename, len + 1);
			if (ResolveCaseInsensitive(resolved, sizeof(resolved))) {
				i = stat(resolved, &buf);
			}
		}
	}
#endif
	return i==0 ? true:false;
}


// Like FileExists, but fixes the filename in-place on Linux so subsequent
// open() calls use the correct case. Callers must pass a mutable buffer.
bool FileExistsMutable( char* filename, size_t bufLen )
{
	struct stat buf;
	int i = stat( filename, &buf );
#ifdef __linux__
	if (i != 0) {
		if (ResolveCaseInsensitive(filename, bufLen)) {
			i = stat(filename, &buf);
		}
	}
#endif
	return i==0 ? true:false;
}
