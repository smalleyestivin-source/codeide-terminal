#ifndef TAR_EXTRACT_H
#define TAR_EXTRACT_H
#include <stddef.h>
/* Extrae un .tar.gz en dest. Devuelve el número de entradas extraídas, o -1 con el motivo en err. */
int tar_extract_gz(const char *gzpath, const char *dest, char *err, size_t errlen);
#endif
