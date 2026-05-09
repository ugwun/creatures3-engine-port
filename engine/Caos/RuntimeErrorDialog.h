// SORRY THIS FILE WAS PUT IN COMMON BY MISTAKE IT SHOULDN'T
// BE HERE AND WILL BE MOVED SOMEWHERE MORE APPROPRIATE SOON
// --------------------------------------------------------------------------
// Filename:	RuntimeErrorDialog.h
// Class:		RuntimeErrorDialog
// Purpose:		This provides a general progress dialog
//				
//				
//				
//
// Description: Shows the progression of a certain process.
//			
//			
//
// History:
// -------  
// 17Mar98	Alima		Created
//	
// --------------------------------------------------------------------------
#ifndef _RUNTIME_ERROR_DIALOG_H
#define _RUNTIME_ERROR_DIALOG_H


#include	"../Display/System.h"
#include <string>


class RuntimeErrorDialog
{
public:

	enum
	{
		RED_RUNNING,
		RED_IGNORE,
		RED_FREEZE,
		RED_KILL,
		RED_PAUSEGAME,
		RED_STOPSCRIPT
	};

	RuntimeErrorDialog();

	void SetText(const std::string& text);
	void SetCameraPossible(bool camera);
	int DisplayDialog();

// attributes:
public:
	std::string myText;
	bool myCameraChecked;
	bool myCameraPossible;
};


#endif	// _RUNTIME_ERROR_DIALOG_H
