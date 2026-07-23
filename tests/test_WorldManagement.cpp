#include <gtest/gtest.h>

#include "ConfiguredPath.h"
#include "WorldMetadata.h"

#include <fstream>
#include <string>
#include <sys/stat.h>
#include <unistd.h>

namespace {

class WorldMetadataTest : public ::testing::Test {
protected:
  void SetUp() override {
    char pattern[] = "/tmp/lc2e_world_metadata_XXXXXX";
    char *created = mkdtemp(pattern);
    ASSERT_NE(created, nullptr);
    root = created;
    worlds = root + "/My Worlds";
    ASSERT_EQ(mkdir(worlds.c_str(), 0755), 0);
  }

  void TearDown() override {
    RemoveWorld("Undocked World");
    RemoveWorld("Docked World");
    RemoveWorld("Missing Type");
    RemoveWorld("Malformed Type");
    rmdir(worlds.c_str());
    rmdir(root.c_str());
  }

  void CreateWorldDirectory(const std::string &name) {
    ASSERT_EQ(mkdir((worlds + "/" + name).c_str(), 0755), 0);
  }

  void RemoveWorld(const std::string &name) {
    std::string world = worlds + "/" + name;
    std::string journal = world + "/Journal";
    unlink((journal + "/wtype").c_str());
    unlink((journal + "/build").c_str());
    rmdir(journal.c_str());
    rmdir(world.c_str());
  }

  std::string root;
  std::string worlds;
};

TEST(ConfiguredPathTest, ResolvesMigratedWindowsPrimaryPath) {
  EXPECT_EQ(ConfiguredPath::ResolvePrimary(
                "C:\\Games\\Creatures Docking Station\\Docking Station\\Images\\"),
            "./Images/");
  EXPECT_EQ(ConfiguredPath::ResolvePrimary("."), "./");
}

TEST(ConfiguredPathTest, ResolvesMigratedWindowsAuxiliaryPathToSiblingGame) {
  EXPECT_EQ(
      ConfiguredPath::ResolveAuxiliary(
          "C:\\Program Files (x86)\\Steam\\steamapps\\common\\"
          "Creatures Docking Station\\Creatures 3\\Bootstrap\\",
          false),
      "./../Creatures 3/Bootstrap/");
  EXPECT_EQ(ConfiguredPath::ResolveAuxiliary(
                "C:\\Games\\Creatures Docking Station\\Creatures 3\\", true),
            "./../Creatures 3/");
}

TEST(ConfiguredPathTest, PreservesNativeAbsoluteAndRelativeAuxiliaryPaths) {
  EXPECT_EQ(ConfiguredPath::ResolveAuxiliary("/opt/c3/Bootstrap", false),
            "/opt/c3/Bootstrap/");
  EXPECT_EQ(ConfiguredPath::ResolveAuxiliary("../Creatures 3/Bootstrap", false),
            "./../Creatures 3/Bootstrap/");
}

TEST(WorldMetadataNameTest, RejectsPathTraversalAndControlCharacters) {
  EXPECT_TRUE(WorldMetadata::IsValidWorldName("Norn Test 1"));
  EXPECT_FALSE(WorldMetadata::IsValidWorldName(""));
  EXPECT_FALSE(WorldMetadata::IsValidWorldName(".."));
  EXPECT_FALSE(WorldMetadata::IsValidWorldName("../Other"));
  EXPECT_FALSE(WorldMetadata::IsValidWorldName("Folder\\Other"));
  EXPECT_FALSE(WorldMetadata::IsValidWorldName("Bad\nName"));
}

TEST_F(WorldMetadataTest, WritesAndReadsUndockedMetadata) {
  CreateWorldDirectory("Undocked World");
  std::string error;
  ASSERT_TRUE(WorldMetadata::Write(worlds, "Undocked World",
                                   WorldMetadata::Undocked, "195", error))
      << error;

  WorldMetadata::Type type = WorldMetadata::Docked;
  bool found = false;
  ASSERT_TRUE(WorldMetadata::ReadType(worlds, "Undocked World", type, found,
                                      error))
      << error;
  EXPECT_TRUE(found);
  EXPECT_EQ(type, WorldMetadata::Undocked);

  std::ifstream build((worlds + "/Undocked World/Journal/build").c_str());
  std::string buildNumber;
  std::getline(build, buildNumber);
  EXPECT_EQ(buildNumber, "195");
}

TEST_F(WorldMetadataTest, WritesAndReadsDockedMetadata) {
  CreateWorldDirectory("Docked World");
  std::string error;
  ASSERT_TRUE(WorldMetadata::Write(worlds, "Docked World",
                                   WorldMetadata::Docked, "195", error))
      << error;

  WorldMetadata::Type type = WorldMetadata::Undocked;
  bool found = false;
  ASSERT_TRUE(
      WorldMetadata::ReadType(worlds, "Docked World", type, found, error))
      << error;
  EXPECT_TRUE(found);
  EXPECT_EQ(type, WorldMetadata::Docked);
}

TEST_F(WorldMetadataTest, ReportsMissingTypeWithoutTreatingItAsAnError) {
  CreateWorldDirectory("Missing Type");
  std::string error;
  WorldMetadata::Type type = WorldMetadata::Undocked;
  bool found = true;
  EXPECT_TRUE(
      WorldMetadata::ReadType(worlds, "Missing Type", type, found, error));
  EXPECT_FALSE(found);
  EXPECT_TRUE(error.empty());
}

TEST_F(WorldMetadataTest, RejectsMalformedTypeMetadata) {
  CreateWorldDirectory("Malformed Type");
  ASSERT_EQ(mkdir((worlds + "/Malformed Type/Journal").c_str(), 0755), 0);
  std::ofstream typeFile(
      (worlds + "/Malformed Type/Journal/wtype").c_str());
  typeFile << "combined";
  typeFile.close();

  std::string error;
  WorldMetadata::Type type = WorldMetadata::Undocked;
  bool found = false;
  EXPECT_FALSE(
      WorldMetadata::ReadType(worlds, "Malformed Type", type, found, error));
  EXPECT_NE(error.find("Unknown world type"), std::string::npos);
}

} // namespace
