// --------------------------------------------------------------------------
// Filename:	File.h
// Class:		File
// Purpose:		A general class for reading files
//				
//
// Description: Add functions as required.
//			
//				
//
// History:
// -------  Chris Wylie		created
// 11Nov98	Alima			Added Seek.
// 09Aug99  BenC            Portability work.
// --------------------------------------------------------------------------

// TODO
// - better error handling on win32 Read/Write? throw exception?
// - are string Read/Write fns used?


#ifndef		FILE_H
#define		FILE_H

//#include	"../engine/Display/System.h"
#include "../common/C2eTypes.h"
#include "../common/BasicException.h"

#include	<string>


//#include <sys/io.h>
#include <unistd.h>
#define INVALID_HANDLE_VALUE -1
// access flags:
#define GENERIC_READ 1
#define GENERIC_WRITE 2
// sharemode:
#define FILE_SHARE_READ 1
#define FILE_SHARE_WRITE 2





class File
{
public:
	typedef int oshandle;
	enum FilePosition
	{
		Start=SEEK_SET,
		Current=SEEK_CUR,
		End=SEEK_END
	};

	File() : myDiskFileHandle(INVALID_HANDLE_VALUE)
	{
	};

	File(const std::string& name, 
		uint32 desiredAccessFlags = GENERIC_READ|GENERIC_WRITE,
		uint32 shareModeFlags = FILE_SHARE_READ);

	virtual void Open( const std::string& name, 
			uint32 desiredAccessFlags = GENERIC_READ|GENERIC_WRITE,
			uint32 shareModeFlags = FILE_SHARE_READ);

	virtual void Create( const std::string& name,   
			uint32 desiredAccessFlags = GENERIC_READ|GENERIC_WRITE,
		   uint32 shareModeFlag = FILE_SHARE_READ);

	virtual ~File()
	{
		Close();
	}

	uint32 GetSize(void);

	const char* GetName()
		{return myName.c_str();}

	// ----------------------------------------------------------------------
	// Method:      Read 
	// Arguments:   buffer		- buffer to receive file data
	//				size		- size of buffer
	// Returns:     the number of bytes read 
	//			
	// Description: 
	// ----------------------------------------------------------------------
	uint32 Read(void* buffer,uint32 size);

	void Read(std::string& string);

	// ----------------------------------------------------------------------
	// Method:      Write 
	// Arguments:   buffer		- buffer holding file data
	//				size		- size of buffer
	// Returns:     the number of bytes written 
	//			
	// Description: This method needs to be written!!!
	// ----------------------------------------------------------------------
	uint32 Write(const void* buffer,uint32 size);

	void Write(std::string string);

	// ----------------------------------------------------------------------
	// Method:      Seek  
	// Arguments:   None
	// Returns:     moveBy - number of bytes to move the file pointer
	//				from - from the end begining or current position in the 
	//						file.
	// Description: 
	// ----------------------------------------------------------------------
	int32 Seek(int32 moveBy, FilePosition from);
	// ----------------------------------------------------------------------
	// Method:      SeekToBegin  
	// Arguments:   None
	// Returns:    -1 if failed 1 otherwise
	//			
	// Description: Moves the file pointer to the start of the file
	// ----------------------------------------------------------------------
	int32 SeekToBegin();

	// ----------------------------------------------------------------------
	// Method:      Close  
	// Arguments:   None
	// Returns:     None
	//			
	// Description: Closes the file
	// ----------------------------------------------------------------------
	void Close();

	bool Valid()
		{return (myDiskFileHandle !=INVALID_HANDLE_VALUE);}

	oshandle GetHandle()
		{return myDiskFileHandle;}

	static bool FileExists(std::string& filename);

	// Exceptions
	class FileException: public BasicException
	{
	public:
		FileException(std::string what, uint16 line):
		BasicException(what.c_str()),
		lineNumber(line){;}

		uint16 LineNumber()
			{return lineNumber;}
	private:

		uint16 lineNumber;
	};

protected:

	// Copy constructor and assignment operator
	// Declared but not implemented
	File (const File&);
	File& operator= (const File&);

	oshandle	myDiskFileHandle;
	std::string myName;

};



//------------------
// Inlines
//------------------








// posix version

inline uint32 File::Read(void* buffer,uint32 size)
{
	ASSERT( myDiskFileHandle != INVALID_HANDLE_VALUE );
	int count = read( myDiskFileHandle, buffer, size );
	if( count == -1 )
		throw FileException( "File::Read() failed", __LINE__ );
	return (uint32)count;
}

inline uint32 File::Write(const void* buffer,uint32 size)
{
	ASSERT( myDiskFileHandle != INVALID_HANDLE_VALUE );
	int count = write( myDiskFileHandle, buffer, size );
	if( count == -1 )
		throw FileException( "File::Write() failed", __LINE__ );

	return (uint32)count;
}


#endif		// FILE_H

