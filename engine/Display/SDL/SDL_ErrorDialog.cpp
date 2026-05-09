// --------------------------------------------------------------------------
// Filename:	SDL_ErrorDialog.cpp
// Class:		ErrorDialog
// Purpose:
//
// Description:
//
// History:
//
// --------------------------------------------------------------------------

#include "SDL_ErrorDialog.h"

#include <iostream>

ErrorDialog::ErrorDialog() {}

void ErrorDialog::SetText(const std::string &source, const std::string &text) {
  myText = text;
  mySource = source;
}

#include <iostream>

int ErrorDialog::DisplayDialog() {
  std::cerr << "ERROR: " << mySource << "\n" << myText << std::endl;
  return 0;
}
