// --------------------------------------------------------------------------
// Filename:	MainCamera.cpp
// Class:		MainCamera
// Purpose:		This class provides a view of the world to clients.
//				The MainCamera has a position in world
// coordinates. 				The interface will give te
// client the usual camera 				operations e.g. panning,
// tracking.
//
//				The MainCamera has a window inside it which
// takes care of 				the windows messages.  It needs
// to have the name of 				the background it displays and a
// list of entities. 				It may also have a list of
// cameras each of which 				draw to the display
// engine owned by the main window.
//
//
//
// Description: All entities are stored in myEntities.  At the start all objects
//				are on the free list.  From there they can be
// put on the 				update list.
//
//				There is only ever one mainview which gets
// created the 				first time someone tries to access it.
// The main view can be disabled which will suspend the
// display engine.
//
//
//
// History:
// -------
// 11Nov98	Alima			Created.
//
// --------------------------------------------------------------------------


#include "MainCamera.h"
#include "DisplayEngine.h"
#include "ErrorMessageHandler.h"
#include "MapImage.h"
#include "RemoteCamera.h"
#include "SharedGallery.h"
#include "../World.h"

#include "SDL/SDL_Main.h" // IsHeadlessMode()

// serialize out as many members as you need to recreate yourself
CREATURES_IMPLEMENT_SERIAL(MainCamera)

MainCamera::MainCamera()
    : myFullScreenFlag(0),
      myShutDownFlag(1), myMapImage(0) {
  DisplayEngine::theRenderer().SetFlags(DISPLAY_BACKGROUND | DISPLAY_SPRITES);
}

#warning TODO: non-win32 version please.

MainCamera::~MainCamera() {
  // all cameras should be deleted by now
  //	myCameras.clear();
}


bool MainCamera::StartUp(
    int32 viewx, // world x co-ordinate of view
    int32 viewy, // world y co-ordinate of view
    bool fullScreen, std::string &defaultBackground,
    uint32 topLeftXofBackground, // top left world co-ordinates
    uint32 topLeftYofBackground) // of background
{
  myWorldPosition.SetX(viewx);
  myWorldPosition.SetY(viewy);
  myFullScreenFlag = fullScreen;

  if (!IsHeadlessMode()) {
    // start up the display engine
    DisplayEngine::theRenderer().SetFlags(DISPLAY_BACKGROUND | DISPLAY_SPRITES);

    StartDisplayEngine();

    SharedGallery::theSharedGallery().PreloadBackgrounds();
  }

  // fully create the camera
  if (!Create(viewx, // world x co-ordinate of view
              viewy, // world y co-ordinate of view
              -1,    // width and height of camera not valid for main window
              -1, defaultBackground,
              topLeftXofBackground,  // top left world co-ordinates
              topLeftYofBackground)) // scale
  {
    return false;
  }

  SetViewArea();
  myShutDownFlag = false;

  return true;
}


  bool MainCamera::Enable() {
    if (myShutDownFlag || DisplayEngine::theRenderer().DealingWithExceptions())
      return false;

    myDisabledFlag = false;
    myChangingRoomsFlag = false;
    bool ok = DisplayEngine::theRenderer().ChangeSuspend(true);
    if (ok)
      Update(true, myLoadingFlag);

    return ok;
  }

  bool MainCamera::Disable() {
    if (myShutDownFlag || DisplayEngine::theRenderer().DealingWithExceptions())
      return false;
    myDisabledFlag = true;
    return DisplayEngine::theRenderer().ChangeSuspend(false);
  }

  void MainCamera::ResizeWindow() {
    if (myShutDownFlag || DisplayEngine::theRenderer().DealingWithExceptions())
      return;

    DisplayEngine::theRenderer().ResizeWindow();
    Update(true, myLoadingFlag);
  }

  void MainCamera::MoveWindow() {
    if (myShutDownFlag || DisplayEngine::theRenderer().DealingWithExceptions())
      return;

    DisplayEngine::theRenderer().MoveWindow();
    Update(true, myLoadingFlag);
  }

  void MainCamera::MoveWindow(int32 x, int32 y) {
    if (myShutDownFlag || DisplayEngine::theRenderer().DealingWithExceptions())
      return;

    DisplayEngine::theRenderer().MoveWindow(x, y);
    Update(true, myLoadingFlag);
  }


  void MainCamera::StartDisplayEngine() {
  // Start the SDL display engine (creates the SDL window and surfaces).
  if (!DisplayEngine::theRenderer().Start(myFullScreenFlag)) {
    ErrorMessageHandler::Show(theDisplayErrorTag,
                              (int)DisplayEngine::sidDirectDrawNotCreated,
                              std::string("MainCamera::StartDisplayEngine"));
  }
  }

  void MainCamera::Render() {
    // Headless mode: skip all rendering and camera tracking.
    if (IsHeadlessMode())
      return;

    // ensure that no rogue rendering gets done
    if (myShutDownFlag || DisplayEngine::theRenderer().DealingWithExceptions())
      return;

    if (myTrackObject.IsInvalid())
      StopTracking();

    // if we are not panning...
    if (!Pan()) {
      // drag with middle mouse button
      if (!MiddleMouseDragMouseWheel()) {
        // make sure pointer pos is up to date for this
        thePointer.GetPointerAgentReference().CameraPositionNotify();
        // if the pointer isn't push-scrolling the edge of the screen...
        if (!KeepUpThenWithMouse()) {
          // if we are tracking an object then pan to set it in the centre
          if (!TrackObject()) {
          }
        }
      }
    }

    DoTrackingChecks();

    // Always force a complete background redraw.
    //
    // The dirty-tile optimisation (only repainting the 128x128 background tiles
    // under sprites that moved) is unnecessary. In the back-buffer renderer the
    // software surface retains pixel data between frames; if a dirty-tile entry
    // is ever stale or miscomputed the wrong background tile persists on screen
    // until something (an agent, the hand cursor) moves over it and forces a
    // repaint.  This manifests as an intermittent square showing content from a
    // previous camera position (typically the Norn Terrarium at ~367, 942).
    //
    // Forcing completeRedraw == true every frame eliminates the issue with
    // negligible cost (~35 tiles × 32 KB ≈ 1.1 MB memcpy per frame).
#ifdef C2E_SDL
    bool forceComplete = true;
#else
    bool forceComplete = myCompleteRedraw;
#endif
    Update(forceComplete || DisplayEngine::theRenderer()
                                   .ShouldIRenderTheEntireMainCameraOrNot(),
           myLoadingFlag);
    // complete redraw the first frame, and not after that
    myCompleteRedraw = false;

    if (myTrackObject.IsValid())
      SetTrackMetaRoom();
  }

  void MainCamera::ShutDown() {
    myShutDownFlag = true;
    myEntityHandler.ShutDown();
    DisplayEngine::theRenderer().Stop();
  }

  void MainCamera::MakeFastImage(EntityImage & entity) {
    if (myShutDownFlag || DisplayEngine::theRenderer().DealingWithExceptions())
      return;

    // ask the display engine to make a fast object out of
    // the entity
    DisplayEngine::theRenderer().CreateFastObject(entity, 9999);
  }

  void MainCamera::MakeMapImage() {
    if (myMapImage || myShutDownFlag ||
        DisplayEngine::theRenderer().DealingWithExceptions())
      return;

    // ask the display engine to make a fast object out of
    // the entity
    myMapImage = DisplayEngine::theRenderer().CreateMapImage(9998);
  }

  void MainCamera::DisableMapImage() {
    if (myMapImage) {
      myMapImage->Disable();
      Update(true, myLoadingFlag);
    }
  }

  void MainCamera::EnableMapImage() {
    if (myMapImage) {
      myMapImage->Enable();
    }
  }

  void MainCamera::ToggleMapImage() {
    if (!myMapImage)
      return;

    myMapImageDisplayed = !myMapImageDisplayed;
    if (myMapImageDisplayed) {
      myMapImage->Enable();
    } else {
      myMapImage->Disable();
      Update(true, myLoadingFlag);
    }
  }

  bool MainCamera::IsMapDisplayed() { return myMapImageDisplayed; }

  MainCamera &MainCamera::theMainCamera() {
    static MainCamera ourMainView;
    return ourMainView;
  }

  RemoteCamera *MainCamera::CreateCamera(
      RECT & view, RECT & bound, std::string & background,
      uint32 topLeftXofBackground, uint32 topLeftYofBackground, int32 plane) {
    RemoteCamera *camera =
        new RemoteCamera(view.left,              // world x co-ordinate of view
                         view.top,               // world y co-ordinate of view
                         view.right - view.left, // width of camera
                         view.bottom - view.top, // height of camera
                         background,
                         topLeftXofBackground, // top left world co-ordinates
                         topLeftYofBackground, plane, bound);

    myCameras.push_back(camera);

    myEntityHandler.Add(camera);

    return camera;
  }

  void MainCamera::RemoveCamera(Camera * camera) {
    std::vector<Camera *>::iterator it;

    for (it = myCameras.begin(); it != myCameras.end(); it++) {
      if ((*it) == camera)
        break;
    }

    if (it != myCameras.end())
      myCameras.erase(it);

    myEntityHandler.Remove(camera);
  }

  void MainCamera::UpdateCameraPlane(Camera * camera) {
    // just remove the camera and then let it get entered in it's correct
    // plane
    myEntityHandler.Remove(camera);
    myEntityHandler.Add(camera);
  }

  void MainCamera::AddCamera(Camera * camera) {

    // when we add a new camera we must share our current list of
    //  entities
    //  but do not draw your self or it could go on forever!!!!
    //	camera->InitialiseRenderList(myEntityHandler);

    myEntityHandler.Add(camera);

    /*	std::vector<Camera*>::iterator it;


            for(it = myCameras.begin(); it != myCameras.end(); it++)
            {
                    (*it)->Add(camera);
            }*/
  }

  void MainCamera::Add(EntityImage *const newEntity) {
    // add it to all your cameras and your own render list
    Camera::Add(newEntity);

    /*	std::vector<Camera*>::iterator it;


            for(it = myCameras.begin(); it != myCameras.end(); it++)
            {
                    (*it)->Add(newEntity);
            }*/
  }

  void MainCamera::Add(Line *const newEntity) {
    // add it to all your cameras and your own render list
    Camera::Add(newEntity);

    /*	std::vector<Camera*>::iterator it;

            for(it = myCameras.begin(); it != myCameras.end(); it++)
            {
                    (*it)->Add(newEntity);
            }*/
  }

  void MainCamera::PrepareForMessageBox() {
    DisplayEngine::theRenderer().PrepareForMessageBox();
  }
  void MainCamera::EndMessageBox() {
    DisplayEngine::theRenderer().EndMessageBox();

    Update(true, myLoadingFlag);
  }

  /*
  void MainCamera::Update(bool completeRedraw,bool justBackBuffer)
  {
  //	char buf[200];
  //	wsprintf(buf,"changing rooms? %d\n",myChangingRoomsFlag);
  //		OutputDebugString(buf);
  if(myChangingRoomsFlag && !justBackBuffer)
  return;

    NormaliseWorldPosition();

          myBackgrounds[0]->SetDisplayPosition(myWorldPosition);
          // find out if the background is smaller than the display width do
  something

            DisplayEngine::theRenderer().SetViewArea(myWorldPosition,*myBackgrounds[0]);

                  myEntityHandler.Update(myWorldPosition);
                  // the individual cameras should only draw to the back buffer
                  DisplayEngine::theRenderer().Update(myBackgrounds[0],&myEntityHandler,
          completeRedraw,justBackBuffer);
                  }

  */

  // ----------------------------------------------------------------------
  // Method:      ChangeMetaRoom
  // Arguments:   backgroundname - new backgrounds name
  //
  // Returns:     None
  // Description: Switch the backgrounds so that the current one is now the
  //				outgoing background.  Create the incoming
  // background
  //
  // ----------------------------------------------------------------------
  void MainCamera::ChangeMetaRoom(std::string & backgroundName, RECT & bounds,
                                  int32 newviewx, int32 newviewy, int32 flip,
                                  bool bCentre, int32 viewWidth, /* = -1*/
                                  int32 viewHeight /*=-1*/) {
    Camera::DoChangeMetaRoom(backgroundName, bounds, newviewx, newviewy, false,
                             bCentre);
    Flip(flip);
  }

  // ----------------------------------------------------------------------
  // Method:      ToggleFullScreenMode
  // Arguments:   None
  //
  // Returns:     true if changed OK
  //				false otherwise
  //
  // Description: On each request it flips the engine between fullscreen
  //				and windowed mode.
  //
  // ----------------------------------------------------------------------
  bool MainCamera::ToggleFullScreenMode() {
    bool ok = DisplayEngine::theRenderer().ToggleFullScreenMode();
    Update(true, myLoadingFlag); // complete redraw
    return ok;
  }

  bool MainCamera::Visible(RECT & rect, int32 scope) {
    bool onCamera = Camera::Visible(rect);

    if (onCamera) {
      return true;
    } else if (scope == 1) {
      // check all remote cameras too then
      /*		std::vector<Camera*>::iterator it;

                      for(it = myCameras.begin(); it != myCameras.end(); it++)
                      {
                              if((*it)->Visible(rect)  == true)
                                      return true;
                      }*/
    }

    return false;
  }

  void MainCamera::UpdatePlane(EntityImage * entityImage) {
    //	std::vector<Camera*>::iterator it;

    /*
    for(it = myCameras.begin(); it != myCameras.end(); it++)
    {
            (*it)->Remove(entityImage,false);
            (*it)->Add(entityImage);
    }
    */

    Remove(entityImage, false); // don't stop tracking if you were being tracked
    Add(entityImage);           // as I am adding you in right now
  }

  // ----------------------------------------------------------------------
  // Method:      Remove
  // Arguments:   newEntity - pointer to new entity to chop from the
  //				list
  // Returns:     true if the entity was found and removed false otherwise
  // Description: This removes the given entityImage from the current update
  //				list.
  //
  // ----------------------------------------------------------------------
  bool MainCamera::Remove(EntityImage *const chop,
                          bool stopTracking /*=true*/) {
    //	std::vector<Camera*>::iterator it;

    /*
    for(it = myCameras.begin(); it != myCameras.end(); it++)
    {
            (*it)->Remove(chop,stopTracking);
    }
    */

    return Camera::Remove(chop, stopTracking);
  }

  // ----------------------------------------------------------------------
  // Method:      Remove
  // Arguments:   newEntity - pointer to new entity to chop from the
  //				list
  // Returns:     true if the entity was found and removed false otherwise
  // Description: This removes the given entityImage from the current update
  //				list.
  //
  // ----------------------------------------------------------------------
  bool MainCamera::Remove(Line *const chop) {

    //	std::vector<Camera*>::iterator it;
    /*
    for(it = myCameras.begin(); it != myCameras.end(); it++)
    {
            (*it)->Remove(chop);
    }
    */
    return Camera::Remove(chop);
  }

  bool MainCamera::Write(CreaturesArchive & ar) const {
    if (Camera::Write(ar)) {

      int size = myCameras.size();
      ar << size;

      std::vector<Camera *>::const_iterator it;

      const Camera *camera = NULL;

      for (it = myCameras.begin(); it != myCameras.end(); it++) {
        camera = (*it);
        ar << camera;
      }
      return true;
    }

    return false;
  }

  bool MainCamera::Read(CreaturesArchive & ar) {

    int32 version = ar.GetFileVersion();

    if (version >= 3) {

      if (!Camera::Read(ar))
        return false;

      Camera *camera = NULL;
      int size = 0;
      ar >> size;

      for (int i = 0; i < size; i++) {
        ar >> camera;
        myCameras.push_back(camera);
      }
    } else {
      _ASSERT(false);
      return false;
    }

    return true;
  }

  bool MainCamera::GetPixelFormat(uint32 & format) {
    return DisplayEngine::theRenderer().GetPixelFormat(format);
  }
