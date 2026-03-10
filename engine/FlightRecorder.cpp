// -------------------------------------------------------------------------
// Filename:    FlightRecorder.cpp
// Class:       FlightRecorder
// Purpose:     Basic logging system
// Description:
// Each log entry should be a single line of text.
//
// Usage:
//
//
// History:
// Jan99	  BenC	Initial version
// -------------------------------------------------------------------------

// Categories so far:
// 1 - error message logging
// 16 - shutdown sequence logging

#ifdef _MSC_VER
#pragma warning(disable : 4786 4503)
#endif

#include "FlightRecorder.h"
#include "C2eServices.h" // MUST come first - breaks circular dep via mfchack.h -> C2eServices.h
#include "Display/ErrorMessageHandler.h"

#ifndef _WIN32
#include <arpa/inet.h>
#include <fcntl.h>
#include <netinet/in.h>
#include <string.h> // for memset
#include <sys/socket.h>
#include <time.h> // for clock_gettime
#include <unistd.h>
#endif

FlightRecorder::FlightRecorder() {
  // all categories on by default
  myEnabledCategories = 0xFFFFFFFF;
  myOutFile = NULL;
  myOutFilename[0] = '\0';
  strcpy(myOutFilename, "creatures_engine_logfile.txt");
#ifndef _WIN32
  myUDPSocket = -1;
  myUDPPort = 9999;
#endif
}

FlightRecorder::~FlightRecorder() {
  if (myOutFile) {
    Log(16, "");
    std::string ended =
        std::string("LOG ENDED ") + ErrorMessageHandler::ErrorMessageFooter();
    Log(16, ended.c_str());
    fclose(myOutFile);
  }
#ifndef _WIN32
  if (myUDPSocket >= 0) {
    close(myUDPSocket);
    myUDPSocket = -1;
  }
#endif
}

void FlightRecorder::SetOutFile(const char *filename) {
  // close existing file if any
  if (myOutFile) {
    fclose(myOutFile);
    myOutFile = NULL;
  }

  strcpy(myOutFilename, filename);
}

#ifndef _WIN32
// -------------------------------------------------------------------------
// EnableUDPBroadcast()
// Opens a non-blocking UDP socket that will send each log line as a compact
// JSON packet to 127.0.0.1:<port>. Fire-and-forget: if nothing is listening,
// sendto() silently fails and the game continues normally.
// -------------------------------------------------------------------------
void FlightRecorder::EnableUDPBroadcast(int port) {
  if (myUDPSocket >= 0)
    return; // already open

  int sock = socket(AF_INET, SOCK_DGRAM, 0);
  if (sock < 0)
    return;

  // Make non-blocking so a missing listener never stalls the game.
  int flags = fcntl(sock, F_GETFL, 0);
  if (flags >= 0)
    fcntl(sock, F_SETFL, flags | O_NONBLOCK);

  myUDPSocket = sock;
  myUDPPort = port;
  fprintf(stderr, "[FlightRecorder] UDP broadcast enabled on port %d\n",
          (int)port);
}
#endif

void FlightRecorder::Log(uint32 categorymask, const char *fmt, ...) {
  // 4096 bytes: enough for error messages that include full file paths.
  char buf[4096];
  va_list args;
  int len;

  if (!(categorymask & myEnabledCategories))
    return;

  va_start(args, fmt);
  len = vsnprintf(buf, sizeof(buf) - 2, fmt, args); // -2 leaves room for \n\0
  va_end(args);
  if (len < 0)
    len = 0;
  if (len >= (int)(sizeof(buf) - 2))
    len = (int)(sizeof(buf) - 3); // truncated

  // append a linefeed for file output
  buf[len] = '\n';
  buf[len + 1] = '\0';

#ifndef _WIN32
  // ── UDP monitor broadcast ─────────────────────────────────────────────
  // Done BEFORE the file-open check so the browser monitor works even if
  // the log file cannot be opened (e.g. read-only working directory).
  if (myUDPSocket >= 0) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    unsigned long long ms =
        (unsigned long long)ts.tv_sec * 1000ULL + ts.tv_nsec / 1000000ULL;

    // Escape backslashes and double-quotes for valid JSON.
    char safe[8500];
    int si = 0;
    for (int i = 0; i < len && si < (int)sizeof(safe) - 3; ++i) {
      char c = buf[i];
      if (c == '"' || c == '\\')
        safe[si++] = '\\';
      if (c != '\n' && c != '\r')
        safe[si++] = c;
    }
    safe[si] = '\0';

    char json[8700];
    int jlen =
        snprintf(json, sizeof(json), "{\"t\":%llu,\"cat\":%u,\"msg\":\"%s\"}\n",
                 ms, (unsigned)categorymask, safe);

    if (jlen > 0) {
      struct sockaddr_in dest;
      memset(&dest, 0, sizeof(dest));
      dest.sin_family = AF_INET;
      dest.sin_port = htons(myUDPPort);
      inet_pton(AF_INET, "127.0.0.1", &dest.sin_addr);
      sendto(myUDPSocket, json, (size_t)jlen, 0, (struct sockaddr *)&dest,
             sizeof(dest));
      // Ignore return value — fire and forget.
    }
  }
#endif

  // ── File output ───────────────────────────────────────────────────────
  // open file if needed
  bool madeFile = false;
  if (!myOutFile) {
    if (myOutFilename[0]) {
#ifdef _WIN32
      myOutFile = fopen(myOutFilename, "a+tc");
#else
      myOutFile = fopen(myOutFilename, "a+"); // "tc" is Windows-only
#endif
    }
    madeFile = true;
  }

  if (!myOutFile)
    return;

  if (madeFile) {
    Log(16, "----------------------------------------------------");
    std::string started =
        std::string("LOG STARTED ") + ErrorMessageHandler::ErrorMessageFooter();
    Log(16, started.c_str());
  }

  fwrite(buf, 1, len + 1, myOutFile); // +1 for the '\n'
  fflush(myOutFile);
}

void FlightRecorder::SetCategories(uint32 enablemask) {
  myEnabledCategories = enablemask;
}
