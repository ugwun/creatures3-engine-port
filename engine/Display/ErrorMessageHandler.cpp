// --------------------------------------------------------------------------
// Filename:	ErrorMessageHandler.h
// Class:		ErrorMessageHandler
// Purpose:		To display error messages
//
//
//
//
// Description: There should only ever be one errormessage handler that is
// shared
//				by all
//
//				Doesn't do too much yet but think of the
// possibilites
//
//
// History:
// -------
// 03Feb99	Alima		created.
//						Added load string
// --------------------------------------------------------------------------


#include "ErrorMessageHandler.h"
#include "../C2eServices.h"
#include "../build.h"
#include "DisplayEngine.h"
#include "ErrorDialog.h"
#include <time.h> // for time()

#include <unistd.h> // for getlogin()
#include "SDL/SDL_Main.h"


ErrorMessageHandler::ErrorMessageHandler() {}

// Private function to actually display message
void ErrorMessageHandler::ShowErrorMessage(const std::string &message,
                                           const std::string &source) {
  // Send to browser monitor (UDP) so all engine errors appear in the console.
  // Category 1 = error. Safe to call even before UDP is enabled (no-op then).
  theFlightRecorder.Log(1, "ERROR: %s\n%s", source.c_str(), message.c_str());

  std::string spacedMessage = message;
  if (message[message.size() - 1] != '\n')
    spacedMessage += "\n";

  std::string final_message = spacedMessage + "\n" + ErrorMessageFooter();

  ErrorDialog dlg;
  dlg.SetText(source, final_message);
  int ret;
  ret = dlg.DisplayDialog();

  if (ret == ErrorDialog::ED_QUIT) {
    theFlightRecorder.Log(16, "Quit button for the ShowErrorMessage() "
                              "clicked... Signalling Termination...\n");
    SignalTerminateApplication();
  } else if (ret == ErrorDialog::ED_BRUTAL_ABORT) {
    theFlightRecorder.Log(16, "Erkity, BRUTAL ABORT!!!!!!!");
    _exit(1);
#warning "TODO: Brutal abort for non-win32"
  }
}

ErrorMessageHandler &ErrorMessageHandler::theHandler() {
  static ErrorMessageHandler ourHandler;
  return ourHandler;
}


// Variable arguments doesn't work with const & strings, for some reason,
// so we just let them get copied.  Similarly, it needs to be static.
// Don't pass std::strings as the variable parameters to this -
// do a .c_str() to make them char* first.  vsprintf only understands char*.
void ErrorMessageHandler::Show(std::string baseTag, int offsetID,
                               std::string source, ...) {
  // Read from catalogue
  std::string unformatted = theCatalogue.Get(baseTag, offsetID);

  // Get variable argument list
  va_list args;
  va_start(args, source);
  char szBuffer[4096];
  int nBuf = vsprintf(szBuffer, unformatted.c_str(), args);
  ASSERT(nBuf >= 0 && nBuf < sizeof(szBuffer) / sizeof(szBuffer[0]));
  va_end(args);

  std::string message(szBuffer);

  theHandler().ShowErrorMessage(message, source);
}

// Don't pass std::strings as the variable parameters to this -
// do a .c_str() to make them char* first.  vsprintf only understands char*.
std::string ErrorMessageHandler::Format(std::string baseTag, int offsetID,
                                        std::string source, ...) {
  // Read from catalogue
  std::string unformatted = theCatalogue.Get(baseTag, offsetID);

  // Get variable argument list
  va_list args;
  va_start(args, source);
  char szBuffer[4096];
  int nBuf = vsprintf(szBuffer, unformatted.c_str(), args);
  ASSERT(nBuf >= 0 && nBuf < sizeof(szBuffer) / sizeof(szBuffer[0]));
  va_end(args);

  return source + std::string("\n\n") + std::string(szBuffer);
}

// This is for strings which are needed before the catalogues are initialised.
// These messages should have NLExxxx at the start - a NonLocalisable Error
// number - so they can be easily distinguished.

// Don't pass std::strings as the variable parameters to this -
// do a .c_str() to make them char* first.  vsprintf only understands char*.
void ErrorMessageHandler::NonLocalisable(std::string unformatted,
                                         std::string source, ...) {
  // Get variable argument list
  va_list args;
  va_start(args, source);
  char szBuffer[4096];
  int nBuf = vsprintf(szBuffer, unformatted.c_str(), args);
  ASSERT(nBuf >= 0 && nBuf < sizeof(szBuffer) / sizeof(szBuffer[0]));
  va_end(args);

  std::string message(szBuffer);

  theHandler().ShowErrorMessage(message, source);
}

// Display message from exception
void ErrorMessageHandler::Show(BasicException &e, std::string source) {
  theHandler().ShowErrorMessage(e.what(), source);
}

// Add useful information to all error messages
std::string ErrorMessageHandler::ErrorMessageFooter() {
  std::string header;

  // date / time
  time_t aclock;
  time(&aclock);
  struct tm *newtime;
  newtime = localtime(&aclock);
  header += asctime(newtime);
  header.erase(header.size() - 1);

  // POSIX version:
  header += " - ";
  const char *loginName = getlogin();
  header += loginName ? loginName : "unknown";

  // version
  header += " - ";
  header += GetEngineVersion();

  return header;
}
