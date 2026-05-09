// --------------------------------------------------------------------------
// Filename:	ErrorMessageHandler.h
// Class:		ErrorMessageHandler
//
// Most error messages can be localised, and so should be in catalogue files.
// This class provides easy functions to format and display messages from
// catalogue files.
// 
// --------------------------------------------------------------------------

#ifndef ERROR_MESSAGE_HANDLER_H
#define ERROR_MESSAGE_HANDLER_H

#include "System.h"
#include <string>
#include "../../common/BasicException.h"

class ErrorMessageHandler 
{
public:
	ErrorMessageHandler();
		
	// display a message from the catalogue
	static void Show(std::string baseTag, int offsetID, std::string source, ...);
	// display a message from one of our exceptions
	static void Show(BasicException& e, std::string source);
	// return a formatted message for throwing in an exception
	static std::string Format(std::string baseTag, int offsetID, std::string source, ...);
	// for strings which can't be in the catalogue (such as catalgoue failure errors)
	static void NonLocalisable(std::string unformatted, std::string source, ...);

	static std::string ErrorMessageFooter();


private:
	// Private to enforce localisation
	void ShowErrorMessage( const std::string& message, const std::string& source);

	// Access is via static functions above, rather than this private function
	static ErrorMessageHandler& theHandler();

};

#endif // ERROR_MESSAGE_HANDLER_H
