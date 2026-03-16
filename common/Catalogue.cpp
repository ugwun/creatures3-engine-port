// -------------------------------------------------------------------------
// Filename:    Catalogue.cpp
// Class:       Catalogue
// Purpose:
// Provide a flexible, simple and reliable stringtable.
//
// Description:
// The catalogue holds a list of localised strings, each of which can be
// called up using a unique (integer) id.
// The catalogue is loaded from catalogue files on disk. These files
// use a simple text format. The contents of the catalogue are compiled
// from any number of these files. Strings don't care which file they
// came from, or even which language - they are simply indexed by their
// id.
//
// If any of the catalogue functions fail, a Catalogue::Err exception
// is throw, containing an error message. Note that this message
// isn't localised (strangely enough).  Because of this, we give it an
// error number CLE000x (CataLogue Error) so that it can easily be identified.
//
//
// Usage:
//
//
// History:
// 19Feb99	Initial version		BenC
// -------------------------------------------------------------------------

#include "Catalogue.h"
#include "FileLocaliser.h"
#include "SimpleLexer.h"

#ifdef _MSC_VER
// turn off warning about symbols too long for debugger
#pragma warning(disable : 4786 4503)
#endif // _MSC_VER

#include <fstream>
#include <iostream>
#include <string>
#include <vector>

#include <stdarg.h>
#include <stdio.h>

Catalogue::Catalogue() { myNextFreeId = 0; }

// Exception constructor with printf-style formatting
Catalogue::Err::Err(const char *fmt, ...) {
  char buf[512];
  va_list args;
  va_start(args, fmt);
  vsprintf(buf, fmt, args);
  va_end(args);

  myMessage = "Catalogue Error: ";
  myMessage += buf;
}

void Catalogue::Clear() {
  myStrings.clear();
  myTags.clear();
}

void Catalogue::AddFile(const std::string &file, const std::string &langid) {
  std::string str(file);
  FileLocaliser small_yellow_and_leechlike;

  if (!small_yellow_and_leechlike.LocaliseFilename(str, langid, "*.catalogue"))
    throw Err("CLE0001: Couldn't localise \"%s\"", file.c_str());

  AddLocalisedFile(str);
}

void Catalogue::AddDir(const std::string &dir, const std::string &langid) {
  std::vector<std::string> files;
  std::vector<std::string>::iterator it;

  FileLocaliser small_yellow_and_leechlike;

  if (!small_yellow_and_leechlike.LocaliseDirContents(dir, langid, files,
                                                      "*.catalogue"))
    throw Err("CLE0002: Error reading directory \"%s\"", dir.c_str());

  for (it = files.begin(); it != files.end(); ++it)
    AddLocalisedFile(*it);
}

void Catalogue::AddLocalisedFile(const std::string &file) {
  bool done;
  int toktype;
  std::string tok;
  std::string arrayCountAsString;

  std::ifstream in(file.c_str());

  if (!in) {
    throw Err("CLE0003: Couldn't open \"%s\"", file.c_str());
  }

  SimpleLexer lex(in);

  std::string previousTag;

  done = false;
  while (!done) {
    toktype = lex.GetToken(tok);
    switch (toktype) {
    case SimpleLexer::typeString:
      // Allow last-write-wins: later catalogue files can override strings
      // from earlier ones (e.g. upgrade/patch catalogues like grendel_upgrade).
      myStrings[myNextFreeId] = tok;
      ++myNextFreeId;
      break;
    case SimpleLexer::typeSymbol:
      if (tok == "TAG" || tok == "ARRAY") {
        if (!previousTag.empty()) {
          int noItems = myNextFreeId - myTags[previousTag].id;
          int currentNoItems = myTags[previousTag].noOfItems;
          if (currentNoItems != -1 && currentNoItems != noItems) {
            throw Err("CLE0011: Number of strings doesn't match array count "
                      "(tag %s in \"%s\", line %d)",
                      previousTag.c_str(), file.c_str(), lex.GetLineNum());
          }
          myTags[previousTag].noOfItems = noItems;
        }

        bool array = (tok == "ARRAY");
        bool overrideExisting = false;

        toktype = lex.GetToken(tok);

        // Handle "TAG OVERRIDE" Docking Station extension:
        // OVERRIDE means replace an existing tag without error.
        if (toktype == SimpleLexer::typeSymbol && tok == "OVERRIDE") {
          overrideExisting = true;
          toktype = lex.GetToken(tok);
        }

        if (toktype != SimpleLexer::typeString) {
          throw Err("CLE0005: Expecting string (in \"%s\", line %d)",
                    file.c_str(), lex.GetLineNum());
        }

        if (myTags.find(tok) != myTags.end()) {
          // Duplicate tag found.  Instead of resetting myNextFreeId
          // backward to the old position (which corrupts string slots
          // belonging to OTHER tags loaded between then and now),
          // just update the tag to point to the current end.  The old
          // slots are orphaned but harmless.
        }

        myTags[tok].id = myNextFreeId;
        myTags[tok].noOfItems = -1;
        previousTag = tok;

        if (array) {
          toktype = lex.GetToken(arrayCountAsString);
          if (toktype != SimpleLexer::typeNumber) {
            throw Err("CLE0007: Expecting number (in \"%s\", line %d)",
                      file.c_str(), lex.GetLineNum());
          }
          myTags[tok].noOfItems = atoi(arrayCountAsString.c_str());
        }
      } else {
        throw Err("CLE0008: Syntax error (\"%s\", line %d)", file.c_str(),
                  lex.GetLineNum());
      }
      break;
    case SimpleLexer::typeFinished:
      done = true;
      break;
    case SimpleLexer::typeError:
      throw Err("CLE0009: Error parsing file (\"%s\", line %d)", file.c_str(),
                lex.GetLineNum());
      break;
    case SimpleLexer::typeNumber:
      throw Err("CLE0014: Unexpected number (\"%s\", line %d)", file.c_str(),
                lex.GetLineNum());
      break;
    }
  }

  if (!previousTag.empty()) {
    int noItems = myNextFreeId - myTags[previousTag].id;
    int currentNoItems = myTags[previousTag].noOfItems;
    if (currentNoItems != -1 && currentNoItems != noItems) {
      throw Err("CLE0010: Number of strings doesn't match array count (tag %s "
                "in \"%s\", line %d)",
                previousTag.c_str(), file.c_str(), lex.GetLineNum());
    }
    myTags[previousTag].noOfItems = noItems;
  }
}

// ---------------------------------------------------------------------------
// AddTagFromFile — selectively import a single tag from a catalogue file.
// Parses the file using SimpleLexer but only stores strings belonging to the
// requested tag.  Returns true if the tag was found and imported.
// ---------------------------------------------------------------------------
bool Catalogue::AddTagFromFile(const std::string &file,
                               const std::string &langid,
                               const std::string &tagName) {
  // Already loaded?  Skip.
  if (TagPresent(tagName))
    return true;

  std::string str(file);
  FileLocaliser loc;
  if (!loc.LocaliseFilename(str, langid, "*.catalogue"))
    return false; // can't localise — not an error, just not found

  std::ifstream in(str.c_str());
  if (!in)
    return false;

  SimpleLexer lex(in);

  bool done = false;
  bool inTargetTag = false;
  std::string currentTag;
  int startId = -1;
  int stringCount = 0;

  while (!done) {
    std::string tok;
    int toktype = lex.GetToken(tok);

    switch (toktype) {
    case SimpleLexer::typeString:
      if (inTargetTag) {
        // Store this string into the catalogue
        myStrings[myNextFreeId] = tok;
        ++myNextFreeId;
        ++stringCount;
      }
      // Strings belonging to other tags are silently discarded.
      break;

    case SimpleLexer::typeSymbol:
      if (tok == "TAG" || tok == "ARRAY") {
        // Finalise the target tag if we just finished it.
        if (inTargetTag) {
          myTags[tagName].noOfItems = stringCount;
          return true; // done — we got our tag
        }

        bool array = (tok == "ARRAY");

        toktype = lex.GetToken(tok);
        // Skip optional OVERRIDE keyword
        if (toktype == SimpleLexer::typeSymbol && tok == "OVERRIDE")
          toktype = lex.GetToken(tok);

        if (toktype != SimpleLexer::typeString)
          return false; // malformed

        if (tok == tagName) {
          inTargetTag = true;
          startId = myNextFreeId;
          stringCount = 0;
          myTags[tagName].id = myNextFreeId;
          myTags[tagName].noOfItems = -1;
        }

        // Consume array count if present
        if (array) {
          std::string countStr;
          lex.GetToken(countStr);
        }
      }
      // Other symbols (shouldn't normally occur) — just skip.
      break;

    case SimpleLexer::typeFinished:
      done = true;
      break;

    case SimpleLexer::typeError:
      return false;

    case SimpleLexer::typeNumber:
      // Unexpected number outside a tag — skip.
      break;
    }
  }

  // If we were still inside the target tag at EOF, finalise it.
  if (inTargetTag) {
    myTags[tagName].noOfItems = stringCount;
    return true;
  }

  return false; // tag not found in file
}

void Catalogue::DumpStrings(std::ostream &out) {
  std::map<int, std::string>::iterator it;
  for (it = myStrings.begin(); it != myStrings.end(); ++it) {
    out << (*it).first << ": " << (*it).second << std::endl;
  }
}

void Catalogue::DumpTags(std::ostream &out) {
  std::map<std::string, TagStruct>::iterator it;
  for (it = myTags.begin(); it != myTags.end(); ++it) {
    out << (*it).first << ": " << (*it).second.noOfItems << std::endl;
  }
}
