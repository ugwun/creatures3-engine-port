// SORRY THIS FILE WAS PUT IN COMMON BY MISTAKE IT SHOULDN'T
// BE HERE AND WILL BE MOVED SOMEWHERE MORE APPROPRIATE SOON
// --------------------------------------------------------------------------
// Filename:	ProgressDialog.h
// Class:		ProgressDialog
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
#ifndef _PROGRESS_DIALOG_H
#define _PROGRESS_DIALOG_H


#include	"../engine/Display/System.h"



class ProgressDialog
{
public:
	ProgressDialog();
	~ProgressDialog();

	void SetCounterRange(int32 iCounterRange = 100);
	void SetBarRange(int32 iBarRange = 100);
	void AdvanceProgressBar();
    void FillProgressBar();
	void AdvanceCounter();
	void SetText(std::string& text);
	
protected:


private:
};


#endif //PROGRESS_DIALOG_H
