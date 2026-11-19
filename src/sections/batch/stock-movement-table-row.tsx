import type { StockMovement, StockMovementType } from 'src/api/firestore/stock-movements';

import Box from '@mui/material/Box';
import TableRow from '@mui/material/TableRow';
import Checkbox from '@mui/material/Checkbox';
import TableCell from '@mui/material/TableCell';
import Typography from '@mui/material/Typography';
import ListItemText from '@mui/material/ListItemText';

import { fDateTime } from 'src/utils/format-time';
import { fNumber, fCurrency } from 'src/utils/format-number';

import { Label } from 'src/components/label';

// ----------------------------------------------------------------------

type Props = {
  row: StockMovement;
  selected?: boolean;
  onSelectRow?: () => void;
  typeLabels: Record<StockMovementType, string>;
  visibleColumns?: Record<string, boolean>;
};

export function StockMovementTableRow({
  row,
  selected,
  onSelectRow,
  typeLabels,
  visibleColumns,
}: Props) {
  const isVisible = (colId: string) => visibleColumns?.[colId] !== false;
  const isIn = row.type === 'IN' || row.type === 'PROCESSING_IN';
  const isProcessing = row.type === 'PROCESSING_IN' || row.type === 'PROCESSING_OUT';

  return (
    <TableRow hover selected={selected} aria-checked={selected} tabIndex={-1}>
      {onSelectRow && (
        <TableCell padding="checkbox">
          <Checkbox checked={selected} onClick={onSelectRow} />
        </TableCell>
      )}

      {isVisible('createdAt') && (
        <TableCell sx={{ typography: 'body2' }}>
          {row.createdAt ? fDateTime(row.createdAt) || '—' : '—'}
        </TableCell>
      )}

      {isVisible('type') && (
        <TableCell>
          <Label
            variant="soft"
            color={isProcessing ? 'info' : isIn ? 'success' : 'warning'}
          >
            {typeLabels[row.type] || row.type}
          </Label>
        </TableCell>
      )}

      {isVisible('lotCode') && (
        <TableCell sx={{ typography: 'subtitle2' }}>{row.lotCode || '—'}</TableCell>
      )}

      {isVisible('productName') && (
        <TableCell>
          <ListItemText
            disableTypography
            primary={
              <Typography variant="subtitle2" noWrap sx={{ fontWeight: 600 }}>
                {row.productName}
              </Typography>
            }
            secondary={
              <Box component="div" sx={{ typography: 'caption', color: 'text.disabled' }}>
                {row.productSku ? `SKU: ${row.productSku}` : ''}
              </Box>
            }
            sx={{ display: 'flex', flexDirection: 'column' }}
          />
        </TableCell>
      )}

      {isVisible('qty') && (
        <TableCell align="right">
          <Typography
            variant="subtitle2"
            sx={{
              fontWeight: 700,
              color: isIn ? 'success.main' : 'warning.main',
            }}
          >
            {isIn ? '+' : '−'}
            {fNumber(row.qty)} {row.unit}
          </Typography>
        </TableCell>
      )}

      {isVisible('unitCost') && (
        <TableCell align="right">
          <Typography variant="body2">
            {typeof row.unitCost === 'number' ? fCurrency(row.unitCost) : '—'}
          </Typography>
        </TableCell>
      )}

      {isVisible('reason') && (
        <TableCell sx={{ typography: 'body2', color: 'text.secondary' }}>
          {row.reason || (row.refId ? `Ref: ${row.refId}` : '—')}
        </TableCell>
      )}
    </TableRow>
  );
}
