import type { GridCellParams } from '@mui/x-data-grid';
import type { Product } from 'src/api/firestore/products';

import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Avatar from '@mui/material/Avatar';
import ListItemText from '@mui/material/ListItemText';

import { fCurrency } from 'src/utils/format-number';
import { fDate, fTime } from 'src/utils/format-time';

import { Label } from 'src/components/label';

// ----------------------------------------------------------------------

type ParamsProps = {
  params: GridCellParams<Product>;
};

export function RenderCellPrice({ params }: ParamsProps) {
  return (
    <Stack spacing={0.25} sx={{ typography: 'body2' }}>
      <Box component="span" sx={{ fontWeight: 600 }}>
        {fCurrency(params.row.salePrice ?? 0)}
      </Box>
      {params.row.costPrice != null && params.row.costPrice > 0 && (
        <Box component="span" sx={{ typography: 'caption', color: 'text.disabled' }}>
          Custo: {fCurrency(params.row.costPrice)}
        </Box>
      )}
    </Stack>
  );
}

export function RenderCellPublish({ params }: ParamsProps) {
  return (
    <Label variant="soft" color={params.row.active ? 'success' : 'default'}>
      {params.row.active ? 'Ativo' : 'Inativo'}
    </Label>
  );
}

export function RenderCellCreatedAt({ params }: ParamsProps) {
  if (!params.row.createdAt) return <>—</>;

  return (
    <Stack spacing={0.5}>
      <Box component="span">{fDate(params.row.createdAt)}</Box>
      <Box component="span" sx={{ typography: 'caption', color: 'text.secondary' }}>
        {fTime(params.row.createdAt)}
      </Box>
    </Stack>
  );
}

export function RenderCellStock({ params }: ParamsProps) {
  const min = params.row.minStock ?? 0;
  const unit = params.row.unit || 'un';

  return (
    <Stack spacing={0.25} sx={{ typography: 'body2' }}>
      <Box component="span" sx={{ fontWeight: 500 }}>
        Mín: {min} {unit}
      </Box>
      <Box component="span" sx={{ typography: 'caption', color: 'text.secondary' }}>
        Unidade: {unit}
      </Box>
    </Stack>
  );
}

export function RenderCellProduct({
  params,
  onViewRow,
}: ParamsProps & {
  onViewRow: () => void;
}) {
  const subtitle = [params.row.category, params.row.sku].filter(Boolean).join(' • ');

  return (
    <Stack direction="row" alignItems="center" sx={{ py: 1.5, width: 1 }}>
      <Avatar
        alt={params.row.name}
        src={params.row.imageUrl}
        variant="rounded"
        sx={{ width: 54, height: 54, mr: 2, flexShrink: 0, bgcolor: 'background.neutral' }}
      >
        {params.row.name?.charAt(0).toUpperCase()}
      </Avatar>

      <ListItemText
        disableTypography
        primary={
          <Link
            noWrap
            color="inherit"
            variant="subtitle2"
            onClick={onViewRow}
            sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
          >
            {params.row.name}
            {params.row.variant ? ` (${params.row.variant})` : ''}
          </Link>
        }
        secondary={
          <Box component="div" sx={{ typography: 'caption', color: 'text.disabled' }}>
            {subtitle || 'Sem categoria'}
          </Box>
        }
        sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}
      />
    </Stack>
  );
}
