import type { Batch } from 'src/api/firestore/batches';
import type { Product } from 'src/api/firestore/products';

import { useState, useCallback } from 'react';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Avatar from '@mui/material/Avatar';
import Dialog from '@mui/material/Dialog';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import InputAdornment from '@mui/material/InputAdornment';

import { fNumber, fCurrency } from 'src/utils/format-number';
import { getEffectiveProductPrice } from 'src/utils/product-pricing';

import { Label } from 'src/components/label';
import { Iconify } from 'src/components/iconify';
import { Scrollbar } from 'src/components/scrollbar';
import { SearchNotFound } from 'src/components/search-not-found';
import { ProductImageBadges } from 'src/components/product-badges/product-image-badges';

import { pickFifoBatch } from './pos-calculator';

// ----------------------------------------------------------------------

type Props = {
  open: boolean;
  onClose: () => void;
  products: Product[];
  batches: Batch[];
  onSelectProduct: (product: Product) => void;
  action?: React.ReactNode;
};

export function ProductListDialog({
  open,
  onClose,
  products,
  batches,
  onSelectProduct,
  action,
}: Props) {
  const [searchQuery, setSearchQuery] = useState('');

  const dataFiltered = products.filter((p) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.ean && p.ean.toLowerCase().includes(q)) ||
      (p.category && p.category.toLowerCase().includes(q)) ||
      (p.variant && p.variant.toLowerCase().includes(q))
    );
  });

  const notFound = !dataFiltered.length && !!searchQuery;

  const handleSelect = useCallback(
    (product: Product) => {
      onSelectProduct(product);
    },
    [onSelectProduct]
  );

  return (
    <Dialog fullWidth maxWidth="sm" open={open} onClose={onClose}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ p: 3, pr: 2 }}
      >
        <Box>
          <Typography variant="h6">Catálogo Rápido de Produtos (PDV)</Typography>
          <Typography variant="caption" color="text.secondary">
            Clique em um produto para adicionar ao carrinho ou pesquise por Nome, SKU ou EAN-13
          </Typography>
        </Box>

        <Stack direction="row" spacing={1}>
          {action}
          <Button size="small" color="inherit" variant="outlined" onClick={onClose}>
            Fechar
          </Button>
        </Stack>
      </Stack>

      <Stack sx={{ px: 3, pb: 2 }}>
        <TextField
          autoFocus
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Pesquisar por Nome, Código SKU, Código de Barras EAN-13 ou Categoria..."
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Iconify icon="eva:search-fill" sx={{ color: 'text.disabled' }} />
              </InputAdornment>
            ),
          }}
        />
      </Stack>

      {notFound ? (
        <SearchNotFound query={searchQuery} sx={{ px: 3, pt: 5, pb: 10 }} />
      ) : (
        <Scrollbar sx={{ p: 2, pt: 0, maxHeight: 480 }}>
          <Stack spacing={1}>
            {dataFiltered.map((prod) => {
              const fifo = pickFifoBatch(batches, prod.id);
              const totalStock = batches
                .filter((b) => b.active && b.productId === prod.id && b.remainingQty > 0)
                .reduce((acc, b) => acc + b.remainingQty, 0);

              return (
                <ButtonBase
                  key={prod.id}
                  onClick={() => handleSelect(prod)}
                  sx={{
                    p: 1.5,
                    width: 1,
                    borderRadius: 1.5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    border: (theme) => `1px solid ${theme.vars.palette.divider}`,
                    '&:hover': {
                      bgcolor: 'action.hover',
                      borderColor: 'primary.main',
                    },
                  }}
                >
                  <Stack direction="row" spacing={2} alignItems="center" sx={{ textAlign: 'left' }}>
                    <Box sx={{ position: 'relative', flexShrink: 0 }}>
                      <Avatar
                        src={prod.imageUrl}
                        variant="rounded"
                        sx={{
                          width: 52,
                          height: 52,
                          bgcolor: 'background.neutral',
                          color: 'text.secondary',
                        }}
                      >
                        <Iconify icon="solar:box-minimalistic-bold" width={24} />
                      </Avatar>
                      <ProductImageBadges
                        compact
                        servingTemperature={prod.servingTemperature}
                      />
                    </Box>

                    <Box>
                      <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
                        <Typography variant="subtitle2">
                          {prod.name} {prod.variant ? `(${prod.variant})` : ''}
                        </Typography>
                        {prod.isCombo && (
                          <Label color="primary" variant="soft">
                            Combo
                          </Label>
                        )}
                        <Label
                          color={prod.type === 'finished' ? 'success' : 'warning'}
                          variant="soft"
                        >
                          {prod.type === 'finished' ? 'Acabado' : 'Insumo'}
                        </Label>
                      </Stack>

                      {prod.description && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{
                            display: '-webkit-box',
                            WebkitLineClamp: 1,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {prod.description}
                        </Typography>
                      )}

                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        SKU: <strong>{prod.sku}</strong>
                        {prod.ean ? ` • EAN-13: ${prod.ean}` : ''}
                        {prod.category ? ` • ${prod.category}` : ''}
                      </Typography>

                      <Typography variant="caption" color="text.disabled">
                        {fifo
                          ? `Lote FIFO: ${fifo.lotCode} • Saldo total: ${fNumber(totalStock)} ${prod.unit}`
                          : 'Sem lote rastreável em estoque'}
                      </Typography>
                    </Box>
                  </Stack>

                  {(() => {
                    const pricing = getEffectiveProductPrice(prod);
                    return (
                      <Stack alignItems="flex-end" spacing={0.5} sx={{ pl: 2 }}>
                        {pricing.hasDiscount ? (
                          <>
                            <Typography
                              variant="caption"
                              sx={{ textDecoration: 'line-through', color: 'text.disabled' }}
                            >
                              {fCurrency(pricing.basePrice)}
                            </Typography>
                            <Typography variant="subtitle1" color="success.main" sx={{ fontWeight: 700 }}>
                              {fCurrency(pricing.effectivePrice)}
                            </Typography>
                          </>
                        ) : (
                          <Typography variant="subtitle1" color="primary.main">
                            {fCurrency(prod.salePrice ?? 0)}
                          </Typography>
                        )}
                        <Label color={pricing.hasDiscount ? 'success' : 'primary'} variant="soft">
                          {pricing.discountBadge ? `${pricing.discountBadge} • +` : '+ Adicionar'}
                        </Label>
                      </Stack>
                    );
                  })()}
                </ButtonBase>
              );
            })}
          </Stack>
        </Scrollbar>
      )}
    </Dialog>
  );
}
