// BenC 30Dec99

// NOTE: win32 version not yet tested(!)

#error // use platform-specific version!

#include <windows.h>

bool FileExists( conat char* filename )
{
	if( GetFileAttributes( filename ) == -1 )
		return false;
	else
		return true;
}


