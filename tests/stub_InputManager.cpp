// stub_InputManager.cpp
// Minimal stub for InputManager used by test_AppHandlers.
//
// The production InputManager.cpp includes App.h and C2eServices.h
// (for TranslatedCharTarget destructor / focus-state archive).
// This stub reimplements the methods needed by tests — mouse/keyboard event
// injection and position/velocity queries — without those heavy deps.
//
// TranslatedCharTarget methods that reference theApp are omitted; no test
// here uses TranslatedCharTarget.

#include "engine/InputManager.h"
#include <cstring>

// Static constants
const int InputManager::ourRecentPositions = 3;
const int InputManager::ourVelocityAgo = 3;

InputManager::InputManager()
    : myEventPendingMask(0), myMouseX(0), myMouseY(0), myRecentPos(0),
      myTranslatedCharTarget(nullptr) {
  myRecentMouseX.resize(ourRecentPositions, 0);
  myRecentMouseY.resize(ourRecentPositions, 0);
  memset(myKeyStates, 0, sizeof(myKeyStates));
}

int InputManager::GetEventCount() { return (int)myEventBuffer.size(); }
int InputManager::GetPendingMask() { return myEventPendingMask; }
const InputEvent &InputManager::GetEvent(int i) { return myEventBuffer[i]; }

void InputManager::SysFlushEventBuffer() {
  myRecentPos = (myRecentPos + 1) % ourRecentPositions;
  myRecentMouseX[myRecentPos] = myMouseX;
  myRecentMouseY[myRecentPos] = myMouseY;
  myEventBuffer.clear();
  myEventPendingMask = 0;
}

void InputManager::SysAddKeyDownEvent(int keycode) {
  InputEvent ev;
  ev.EventCode = InputEvent::eventKeyDown;
  ev.KeyData.keycode = keycode;
  myEventBuffer.push_back(ev);
  myEventPendingMask |= InputEvent::eventKeyDown;
  if (keycode >= 0 && keycode < 256)
    myKeyStates[keycode] = true;
}

void InputManager::SysAddKeyUpEvent(int keycode) {
  InputEvent ev;
  ev.EventCode = InputEvent::eventKeyUp;
  ev.KeyData.keycode = keycode;
  myEventBuffer.push_back(ev);
  myEventPendingMask |= InputEvent::eventKeyUp;
  if (keycode >= 0 && keycode < 256)
    myKeyStates[keycode] = false;
}

void InputManager::SysAddTranslatedCharEvent(int keycode) {
  InputEvent ev;
  ev.EventCode = InputEvent::eventTranslatedChar;
  ev.KeyData.keycode = keycode;
  myEventBuffer.push_back(ev);
  myEventPendingMask |= InputEvent::eventTranslatedChar;
}

void InputManager::SysAddMouseMoveEvent(int mx, int my) {
  InputEvent ev;
  ev.EventCode = InputEvent::eventMouseMove;
  ev.MouseMoveData.mx = mx;
  ev.MouseMoveData.my = my;
  myEventBuffer.push_back(ev);
  myMouseX = mx;
  myMouseY = my;
  myEventPendingMask |= InputEvent::eventMouseMove;
}

void InputManager::SysAddMouseDownEvent(int mx, int my, int button) {
  InputEvent ev;
  ev.EventCode = InputEvent::eventMouseDown;
  ev.MouseButtonData.button = button;
  ev.MouseButtonData.mx = mx;
  ev.MouseButtonData.my = my;
  myEventBuffer.push_back(ev);
  myMouseX = mx;
  myMouseY = my;
  myEventPendingMask |= InputEvent::eventMouseDown;
}

void InputManager::SysAddMouseUpEvent(int mx, int my, int button) {
  InputEvent ev;
  ev.EventCode = InputEvent::eventMouseUp;
  ev.MouseButtonData.button = button;
  ev.MouseButtonData.mx = mx;
  ev.MouseButtonData.my = my;
  myEventBuffer.push_back(ev);
  myMouseX = mx;
  myMouseY = my;
  myEventPendingMask |= InputEvent::eventMouseUp;
}

void InputManager::SysAddMouseWheelEvent(int mx, int my, int delta) {
  InputEvent ev;
  ev.EventCode = InputEvent::eventMouseWheel;
  ev.MouseWheelData.delta = delta;
  ev.MouseWheelData.mx = mx;
  ev.MouseWheelData.my = my;
  myEventBuffer.push_back(ev);
  myEventPendingMask |= InputEvent::eventMouseWheel;
}

bool InputManager::IsKeyDown(int keycode) {
  if (keycode >= 0 && keycode < 256)
    return myKeyStates[keycode];
  return false;
}

void InputManager::SetMousePosition(int newX, int newY) {
  myMouseX = newX;
  myMouseY = newY;
}

float InputManager::GetMouseVX() {
  int velo_pos = (myRecentPos + 1 - ourVelocityAgo + ourRecentPositions) %
                 ourRecentPositions;
  return (float)(myMouseX - myRecentMouseX[velo_pos]) / (float)ourVelocityAgo;
}

float InputManager::GetMouseVY() {
  int velo_pos = (myRecentPos + 1 - ourVelocityAgo + ourRecentPositions) %
                 ourRecentPositions;
  return (float)(myMouseY - myRecentMouseY[velo_pos]) / (float)ourVelocityAgo;
}

TranslatedCharTarget *InputManager::GetTranslatedCharTarget() const {
  return myTranslatedCharTarget;
}

void InputManager::SetTranslatedCharTarget(TranslatedCharTarget *target,
                                           bool tellLoser) {
  TranslatedCharTarget *oldTarget = myTranslatedCharTarget;
  myTranslatedCharTarget = target;
  if (tellLoser && oldTarget)
    oldTarget->LoseFocus();
  if (myTranslatedCharTarget)
    myTranslatedCharTarget->GainFocus();
}

// TranslatedCharTarget — base virtuals only, no theApp reference.
TranslatedCharTarget::~TranslatedCharTarget() {}
