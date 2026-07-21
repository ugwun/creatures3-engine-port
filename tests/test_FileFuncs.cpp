#include "engine/unix/FileFuncs.h"

#include <gtest/gtest.h>

#include <cstdlib>
#include <fstream>
#include <iterator>
#include <string>
#include <sys/stat.h>
#include <unistd.h>

class CopyFileTest : public ::testing::Test {
protected:
  std::string directory;

  void SetUp() override {
    char path[] = "/tmp/lc2e_copyfile_XXXXXX";
    char *created = mkdtemp(path);
    ASSERT_NE(created, nullptr);
    directory = created;
  }

  void TearDown() override {
    unlink(Path("source").c_str());
    unlink(Path("destination").c_str());
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

  std::string ReadFile(const std::string &path) {
    std::ifstream input(path.c_str(), std::ios::binary);
    EXPECT_TRUE(input.good());
    return std::string(std::istreambuf_iterator<char>(input),
                       std::istreambuf_iterator<char>());
  }
};

TEST_F(CopyFileTest, CreatesNewDestination) {
  WriteFile(Path("source"), "creatures data");

  EXPECT_TRUE(CopyFile(Path("source").c_str(), Path("destination").c_str(),
                       false));
  EXPECT_EQ(ReadFile(Path("destination")), "creatures data");
}

TEST_F(CopyFileTest, NoOverwritePreservesExistingDestination) {
  WriteFile(Path("source"), "new data");
  WriteFile(Path("destination"), "existing data");

  EXPECT_FALSE(CopyFile(Path("source").c_str(), Path("destination").c_str(),
                        false));
  EXPECT_EQ(ReadFile(Path("destination")), "existing data");
}

TEST_F(CopyFileTest, OverwriteTruncatesExistingDestination) {
  WriteFile(Path("source"), "short");
  WriteFile(Path("destination"), "long destination contents");

  EXPECT_TRUE(CopyFile(Path("source").c_str(), Path("destination").c_str(),
                       true));
  EXPECT_EQ(ReadFile(Path("destination")), "short");
}

TEST_F(CopyFileTest, CopiesEmptyFile) {
  WriteFile(Path("source"), "");

  EXPECT_TRUE(CopyFile(Path("source").c_str(), Path("destination").c_str(),
                       false));

  struct stat info;
  ASSERT_EQ(stat(Path("destination").c_str(), &info), 0);
  EXPECT_EQ(info.st_size, 0);
}

TEST_F(CopyFileTest, CopiesFileLargerThanInternalBuffer) {
  std::string contents(200000, 'x');
  contents[70000] = 'y';
  contents[150000] = 'z';
  WriteFile(Path("source"), contents);

  EXPECT_TRUE(CopyFile(Path("source").c_str(), Path("destination").c_str(),
                       false));
  EXPECT_EQ(ReadFile(Path("destination")), contents);
}

TEST_F(CopyFileTest, MissingSourceDoesNotCreateDestination) {
  EXPECT_FALSE(CopyFile(Path("source").c_str(), Path("destination").c_str(),
                        false));
  EXPECT_EQ(access(Path("destination").c_str(), F_OK), -1);
}

TEST_F(CopyFileTest, SameFileIsRejectedWithoutDataLoss) {
  WriteFile(Path("source"), "keep me");

  EXPECT_FALSE(
      CopyFile(Path("source").c_str(), Path("source").c_str(), true));
  EXPECT_EQ(ReadFile(Path("source")), "keep me");
}
