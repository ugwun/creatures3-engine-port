
// win32 version

#include "RuntimeErrorDialog.h"
#include <iostream>

RuntimeErrorDialog::RuntimeErrorDialog() {
  myCameraChecked = false;
  myCameraPossible = true;
}

int RuntimeErrorDialog::DisplayDialog() {
  // Log to stderr so runtime errors are visible in the console output.
  std::cerr << "Runtime Error (script stopped): " << myText << std::endl;
  // No dialog on macOS — stop the failed script to prevent the VM from
  // continuing with a corrupted instruction pointer (RED_IGNORE would
  // resume at the broken location and crash on the next tick).
  return RED_STOPSCRIPT;
}

void RuntimeErrorDialog::SetText(const std::string &text) { myText = text; }

void RuntimeErrorDialog::SetCameraPossible(bool camera) {
  myCameraPossible = camera;
}

