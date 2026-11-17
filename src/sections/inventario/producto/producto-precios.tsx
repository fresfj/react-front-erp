import {  useMemo } from "react";

import { Card, CardHeader } from "@mui/material";

import type { IgetUltimosPreciosCompras } from 'src/types/productos';

import UltimosPreciosComprasDTQ from './ult-precios-compras-dtq';

// ----------------------------------------------------------------------
type Props = {
  currentProducto: any;
};

export default function ProductoPrecios({ currentProducto }: Props) {

  const paramGetUltimosPreciosCompras: IgetUltimosPreciosCompras = useMemo(() => (
    { ide_inarti: Number(currentProducto.ide_inarti) }
  ), [currentProducto]);



  return (
    <Card>
      <CardHeader title={(currentProducto.nombre_inarti)} sx={{ mb: 2 }}
      />
      <UltimosPreciosComprasDTQ params={paramGetUltimosPreciosCompras}/>
    </Card>
  );

}
