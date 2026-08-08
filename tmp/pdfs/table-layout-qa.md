# Tabla PARAMETROS

Define los parámetros válidos que pueden ser utilizados para configurar las terminales.

| Campo | Tipo | Obligatorio | Descripción |
| :--- | :--- | :---: | :--- |
| `NOMBRE_PARAMETRO` | `VARCHAR2(100 CHAR)` | Sí | Identificador único del parámetro. Es la clave primaria de la tabla. Ej.: `ORIGEN`, `COBERTURAS_ADMITIDAS`. |
| `DESCRIPCION` | `VARCHAR2(4000 CHAR)` | Sí | Descripción funcional del parámetro y de su finalidad. |
| `TIPO_DATO` | `VARCHAR2(20 CHAR)` | Sí | Tipo de dato almacenado. Valores admitidos: `STRING`, `NUMBER`, `BOOLEAN`, `JSON`. |
| `MULTIPLE` | `CHAR(1 CHAR)` | Sí | Indica si el parámetro admite múltiples valores. Valores posibles: `S` o `N`. |
| `ORIGEN_DATOS` | `VARCHAR2(100 CHAR)` | No | Identifica el origen de los valores disponibles cuando estos deben seleccionarse de un conjunto determinado. Ej.: `COBERTURAS`. Si es `NULL`, el valor no depende de un origen de datos. |
| `CDATE` | `DATE` | No | Fecha de creación del registro. |
