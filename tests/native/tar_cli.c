#include <stdio.h>
#include "../../native/cpp/tar_extract.c"
int main(int argc, char **argv) {
  if (argc < 3) { fprintf(stderr, "uso: tar_cli archivo.tar.gz destino\n"); return 2; }
  char err[256]; int n = tar_extract_gz(argv[1], argv[2], err, sizeof err);
  if (n < 0) { printf("ERR:%s\n", err); return 1; } printf("OK:%d\n", n); return 0;
}
