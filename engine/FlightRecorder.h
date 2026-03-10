// -------------------------------------------------------------------------
// Filename:    FlightRecorder.h
// Class:       FlightRecorder
// Purpose:     Basic logging system
// Description:
// Each log entry should be a single line of text.
//
// Category bitmask values:
//   1  - runtime errors
//  16  - shutdown sequence (SHUT)
//  64  - in-process crash reporter (CRASH)
//
// Usage:
//
//
// History:
// Jan99	  BenC	Initial version
// -------------------------------------------------------------------------
#ifndef FLIGHTRECORDER_H
#define FLIGHTRECORDER_H

// Ideas for improvement
// - [DONE] allow for redirection out to debug console or external process
//   See EnableUDPBroadcast() which streams JSON to a browser monitor.
// - category naming

#ifdef _MSC_VER
#pragma warning(disable : 4786 4503)
#endif

#ifndef FLIGHTRECORDER_TYPES_H
#define FLIGHTRECORDER_TYPES_H
// Minimal types used by FlightRecorder — avoids pulling in C2eTypes.h
// which would trigger mfchack.h -> C2eServices.h -> FlightRecorder.h
// (circular).
typedef unsigned int uint32;
#endif // FLIGHTRECORDER_TYPES_H

#include <stdio.h>

class FlightRecorder {
public:
  // ---------------------------------------------------------------------
  // Method:		Log
  // Arguments:	categorymask - to which category(s) does this msg belong
  //				fmt - printf-style format string (should be
  // single line)
  // Returns:		None
  // Description: Logs the message to the specified category(s).
  // ---------------------------------------------------------------------
  void Log(uint32 categorymask, const char *fmt, ...);

  // ---------------------------------------------------------------------
  // Method:		SetOutFile
  // Arguments:	filename
  // Returns:		None
  // Description: Specifies a file to send log output to
  // ---------------------------------------------------------------------
  void SetOutFile(const char *filename);

  // ---------------------------------------------------------------------
  // Method:		SetCategories
  // Arguments:	enablemask - categories to enable
  // Returns:		None
  // Description: Allows masking-out of specific categories.
  //				Any log data sent to a category with a zero bit
  // in the 				enablemask will be ignored.
  // ---------------------------------------------------------------------
  void SetCategories(uint32 enablemask);

#ifndef _WIN32
  // -----------------------------------------------------------------------
  // Method:		EnableUDPBroadcast
  // Arguments:	port - UDP port to send JSON log lines to (default 9999)
  // Returns:		None
  // Description: Opens a non-blocking UDP socket that fires each log line
  //              as a compact JSON packet to 127.0.0.1:<port>. Completely
  //              optional - if the relay isn't running the game is unaffected.
  // -----------------------------------------------------------------------
  void EnableUDPBroadcast(int port = 9999);
#endif

  FlightRecorder();
  ~FlightRecorder();

private:
#ifdef _WIN32
  char myOutFilename[MAX_PATH];
#else
  // TODO: need to suss out a proper definition for MAX_PATH
  char myOutFilename[512];
#endif
  FILE *myOutFile;
  uint32 myEnabledCategories;
#ifndef _WIN32
  int myUDPSocket; // -1 if not enabled
  unsigned int myUDPPort;
#endif
};

#endif // FLIGHTRECORDER_H
