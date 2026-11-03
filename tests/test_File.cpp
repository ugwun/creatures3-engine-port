#include "engine/File.h"

#include <gtest/gtest.h>

#include <cstdlib>
#include <fstream>
#include <string>
#include <unistd.h>

class FileTest : public ::testing::Test {
protected:
  std::string directory;

  void SetUp() override {
    char path[] = "/tmp/lc2e_file_XXXXXX";
    char *created = mkdtemp(path);
    ASSERT_NE(created, nullptr);
    directory = created;
  }

  void TearDown() override {
    unlink(Path("data").c_str());
    rmdir(directory.c_str());
  }

  std::string Path(const std::string &name) const {
    return directory + "/" + name;
  }

  void WriteFile(const std::string &path, const std::string &contents) {
    std::ofstream output(path.c_str(), std::ios::binary);
    ASSERT_TRUE(output.good());
    output.write(contents.data(), contents.size());
    ASSERT_TRUE(output.good());
  }
};

TEST_F(FileTest, GetSizeWorksAfterOpenOnDefaultConstructedFile) {
  // Creature export opens genomes this way before sizing them.
  WriteFile(Path("data"), "genome");
  File file;
  file.Open(Path("data"));
  EXPECT_EQ(file.GetSize(), 6u);
  EXPECT_EQ(file.GetName(), Path("data"));
}

TEST_F(FileTest, GetSizeFollowsReopenedFile) {
  WriteFile(Path("data"), "abc");
  File file(Path("data"));
  EXPECT_EQ(file.GetSize(), 3u);

  WriteFile(Path("data"), "abcdefgh");
  file.Open(Path("data"));
  EXPECT_EQ(file.GetSize(), 8u);
}

TEST_F(FileTest, GetSizeWorksAfterCreate) {
  File file;
  file.Create(Path("data"));
  file.Write("xy", 2);
  EXPECT_EQ(file.GetSize(), 2u);
  EXPECT_EQ(file.GetName(), Path("data"));
}
