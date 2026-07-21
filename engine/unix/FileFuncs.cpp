// BenC 30Dec99


#include "FileFuncs.h"

#include <stdio.h>
#include <unistd.h>
#include <fcntl.h>
#include <errno.h>
#include <sys/stat.h>
#include <sys/types.h>

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
bool CopyFile( const char* src, const char* dest, bool overwrite )
{
	int infd = -1;
	int outfd = -1;
	struct stat statbuf;
	struct stat deststat;
	bool success = false;	// positive attitude.
	bool destinationCreated = false;
	bool destinationExisted = false;
	int flags = O_CREAT | O_WRONLY;

	// Open the source first so a failed source lookup never creates a
	// destination file.
	infd = open( src, O_RDONLY );
	if( infd == -1 )
		goto cleanup;

	if( fstat( infd, &statbuf ) != 0 )
		goto cleanup;

	// CopyFile(path, path, true) must not truncate its own source.  This also
	// catches different paths (for example hard links) to the same inode.
	if( stat( dest, &deststat ) == 0 )
	{
		destinationExisted = true;
		if( deststat.st_dev == statbuf.st_dev && deststat.st_ino == statbuf.st_ino )
			goto cleanup;
	}

	if( overwrite )
		flags |= O_TRUNC;
	else
		flags |= O_EXCL;	// fail if file exists

	outfd = open( dest, flags, statbuf.st_mode & 0777 );
	if( outfd == -1 )
		goto cleanup;
	destinationCreated = true;

	// read() and write() are allowed to complete only part of a request, and
	// can be interrupted by a signal.  Loop until EOF so large and empty files
	// are both copied correctly.
	for( ;; )
	{
		char buffer[64 * 1024];
		ssize_t bytesRead;
		do
		{
			bytesRead = read( infd, buffer, sizeof(buffer) );
		}
		while( bytesRead == -1 && errno == EINTR );

		if( bytesRead == 0 )
		{
			success = true;
			break;
		}
		if( bytesRead == -1 )
			break;

		ssize_t written = 0;
		while( written < bytesRead )
		{
			ssize_t result;
			do
			{
				result = write( outfd, buffer + written, bytesRead - written );
			}
			while( result == -1 && errno == EINTR );

			if( result <= 0 )
				goto cleanup;
			written += result;
		}
	}

cleanup:
	if( outfd != -1 )
	{
		if( close( outfd ) != 0 )
			success = false;
	}
	if( infd != -1 )
		close( infd );
	if( !success && destinationCreated && !destinationExisted )
		unlink( dest );

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
