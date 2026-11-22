import 'mapbox-gl/dist/mapbox-gl.css';

import type { MapRef } from 'react-map-gl';
import type { Enterprise } from 'src/api/firestore/platform';
import type {
  DeliveryAreaConfig,
  DeliveryRadiusTier,
  DeliveryPricingMode,
  DeliveryNeighborhoodRule,
} from 'src/sections/online-store/delivery-area-domain';

import mapboxgl from 'mapbox-gl';
import { useRef, useMemo, useState, useEffect } from 'react';
import { Layer, Source, Marker, NavigationControl } from 'react-map-gl';

import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Collapse from '@mui/material/Collapse';
import TextField from '@mui/material/TextField';
import CardHeader from '@mui/material/CardHeader';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import LoadingButton from '@mui/lab/LoadingButton';
import InputAdornment from '@mui/material/InputAdornment';
import FormControlLabel from '@mui/material/FormControlLabel';

import { useBoolean } from 'src/hooks/use-boolean';

import { fCurrency } from 'src/utils/format-number';

import { CONFIG } from 'src/config-global';

import { Map } from 'src/components/map';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { CustomTabs } from 'src/components/custom-tabs';

import {
  RADIUS_TIER_COLORS,
  createCircleGeoJson,
  geocodeAddressBrazil,
  getMaxActiveRadiusKm,
  buildAddressSearchQuery,
  createDefaultRadiusTiers,
} from 'src/sections/online-store/delivery-area-domain';

import { DeliveryRadiusRasterMap } from './delivery-radius-raster-map';

// ----------------------------------------------------------------------

type Props = {
  value: DeliveryAreaConfig;
  onChange: (next: DeliveryAreaConfig) => void;
  enterprise: Enterprise | null;
  disabled?: boolean;
};

const DEFAULT_BRAZIL_CENTER = { lat: -1.4558, lng: -48.4902 };

export function AccountDeliveryAreaEditor({ value, onChange, enterprise, disabled }: Props) {
  const openSection = useBoolean(true);
  const mapRef = useRef<MapRef | null>(null);
  const [searchText, setSearchText] = useState(value.originLabel || '');
  const [geocoding, setGeocoding] = useState(false);
  const [useRasterFallback, setUseRasterFallback] = useState(() => {
    try {
      return !mapboxgl.supported();
    } catch {
      return true;
    }
  });

  const hasMapboxKey = Boolean(CONFIG.mapbox.apiKey);
  const showWebGlMap = hasMapboxKey && !useRasterFallback;

  const originLat = value.originLat ?? DEFAULT_BRAZIL_CENTER.lat;
  const originLng = value.originLng ?? DEFAULT_BRAZIL_CENTER.lng;
  const hasOrigin =
    typeof value.originLat === 'number' &&
    Number.isFinite(value.originLat) &&
    typeof value.originLng === 'number' &&
    Number.isFinite(value.originLng);

  useEffect(() => {
    if (mapRef.current && hasOrigin) {
      mapRef.current.flyTo({
        center: [originLng, originLat],
        duration: 600,
      });
    }
  }, [hasOrigin, originLat, originLng]);

  const activeTiersDesc = useMemo(
    () =>
      [...(value.radiusTiers || [])]
        .filter((t) => t.active && Number(t.maxKm) > 0)
        .sort((a, b) => b.maxKm - a.maxKm),
    [value.radiusTiers]
  );

  const maxRadiusKm = useMemo(() => getMaxActiveRadiusKm(value), [value]);

  const handleModeChange = (_: unknown, nextMode: DeliveryPricingMode | null) => {
    if (!nextMode || disabled) return;
    const nextTiers =
      nextMode === 'radius' && (!value.radiusTiers || value.radiusTiers.length === 0)
        ? createDefaultRadiusTiers()
        : value.radiusTiers;
    onChange({
      ...value,
      mode: nextMode,
      radiusTiers: nextTiers,
    });
  };

  const handleGeocode = async (queryStr: string) => {
    if (!queryStr.trim()) {
      toast.error('Informe o endereço ou CEP da loja para localizar no mapa.');
      return;
    }
    setGeocoding(true);
    try {
      const result = await geocodeAddressBrazil(queryStr);
      if (!result) {
        toast.error('Não foi possível localizar esse endereço. Tente incluir cidade e estado.');
        return;
      }
      setSearchText(result.label);
      onChange({
        ...value,
        originLat: Number(result.lat.toFixed(6)),
        originLng: Number(result.lng.toFixed(6)),
        originLabel: result.label,
      });
      toast.success('Localização da loja atualizada no mapa!');
    } finally {
      setGeocoding(false);
    }
  };

  const handleUseEnterpriseAddress = () => {
    if (!enterprise) return;
    const query = buildAddressSearchQuery({
      street: enterprise.address,
      number: enterprise.addressNumber,
      neighborhood: enterprise.neighborhood,
      city: enterprise.city,
      state: enterprise.state,
      cep: enterprise.zipCode,
    });
    if (!query) {
      toast.error('Cadastre o endereço da empresa em "Dados da empresa" primeiro.');
      return;
    }
    handleGeocode(query);
  };

  const handleAddTier = () => {
    const current = value.radiusTiers || [];
    const lastMax = current.length ? Math.max(...current.map((t) => Number(t.maxKm || 0))) : 0;
    const nextColor = RADIUS_TIER_COLORS[current.length % RADIUS_TIER_COLORS.length];
    const nextTier: DeliveryRadiusTier = {
      id: `tier-${Date.now()}`,
      maxKm: Math.max(1, Math.round((lastMax + 3) * 10) / 10),
      fee: current.length ? Number(current[current.length - 1].fee || 0) + 4 : 5,
      estimatedMinutes: current.length
        ? Number(current[current.length - 1].estimatedMinutes || 30) + 10
        : 30,
      active: true,
      color: nextColor,
    };
    onChange({ ...value, radiusTiers: [...current, nextTier] });
  };

  const handleUpdateTier = (id: string, patch: Partial<DeliveryRadiusTier>) => {
    onChange({
      ...value,
      radiusTiers: (value.radiusTiers || []).map((t) => (t.id === id ? { ...t, ...patch } : t)),
    });
  };

  const handleRemoveTier = (id: string) => {
    onChange({
      ...value,
      radiusTiers: (value.radiusTiers || []).filter((t) => t.id !== id),
    });
  };

  const handleAddNeighborhood = () => {
    const current = value.neighborhoods || [];
    const nextRule: DeliveryNeighborhoodRule = {
      id: `nb-${Date.now()}`,
      name: '',
      city: enterprise?.city || '',
      fee: 6,
      estimatedMinutes: 35,
      active: true,
    };
    onChange({ ...value, neighborhoods: [...current, nextRule] });
  };

  const handleUpdateNeighborhood = (id: string, patch: Partial<DeliveryNeighborhoodRule>) => {
    onChange({
      ...value,
      neighborhoods: (value.neighborhoods || []).map((n) => (n.id === id ? { ...n, ...patch } : n)),
    });
  };

  const handleRemoveNeighborhood = (id: string) => {
    onChange({
      ...value,
      neighborhoods: (value.neighborhoods || []).filter((n) => n.id !== id),
    });
  };

  return (
    <Card>
      <CardHeader
        title="Área de entrega e taxas"
        subheader="Defina sua área de entrega por taxa fixa, raio no mapa (km) ou bairros atendidos e evite pedidos fora da rota."
        action={
          <IconButton onClick={openSection.onToggle}>
            <Iconify
              icon={openSection.value ? 'eva:arrow-ios-upward-fill' : 'eva:arrow-ios-downward-fill'}
            />
          </IconButton>
        }
        sx={{ mb: 2 }}
      />
      <Collapse in={openSection.value}>
        <Divider />
        <Stack spacing={3} sx={{ p: 3 }}>
          {/* Seletor de modo (CustomTabs animado padrão PDV) */}
          <Stack spacing={1}>
            <Typography variant="subtitle2">Modelo de cobrança de entrega</Typography>
            <CustomTabs
              value={value.mode}
              onChange={(evt, nextMode: DeliveryPricingMode) => handleModeChange(evt, nextMode)}
              variant="fullWidth"
              sx={{
                borderRadius: 1.5,
                bgcolor: 'background.neutral',
                minHeight: 52,
                opacity: disabled ? 0.6 : 1,
                pointerEvents: disabled ? 'none' : 'auto',
              }}
              slotProps={{
                indicator: {
                  borderRadius: 1,
                  boxShadow: (theme) => theme.customShadows.z4,
                },
                tab: {
                  minHeight: 44,
                  py: 0.75,
                  typography: 'subtitle2',
                },
              }}
            >
              <Tab
                value="fixed"
                label="Taxa fixa única"
                icon={<Iconify icon="solar:tag-price-bold-duotone" width={18} />}
                iconPosition="start"
              />
              <Tab
                value="radius"
                label="Por raio (km no mapa)"
                icon={<Iconify icon="solar:map-point-wave-bold-duotone" width={18} />}
                iconPosition="start"
              />
              <Tab
                value="neighborhood"
                label="Por bairros"
                icon={<Iconify icon="solar:buildings-2-bold-duotone" width={18} />}
                iconPosition="start"
              />
            </CustomTabs>
          </Stack>

          {value.mode === 'fixed' && (
            <Alert severity="info">
              No modo <strong>Taxa fixa única</strong>, todos os pedidos de entrega utilizam o campo{' '}
              <strong>Taxa de entrega padrão</strong> acima, sem restrição de raio ou bairro.
            </Alert>
          )}

          {/* MODO RAIO (MAPBOX GL) */}
          {value.mode === 'radius' && (
            <Stack spacing={2.5}>
              {/* Origem da loja */}
              <Stack spacing={1.5}>
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  alignItems={{ sm: 'center' }}
                  justifyContent="space-between"
                  spacing={1}
                >
                  <Typography variant="subtitle2">Ponto de origem da loja</Typography>
                  <LoadingButton
                    size="small"
                    variant="soft"
                    color="primary"
                    loading={geocoding}
                    disabled={disabled}
                    startIcon={<Iconify icon="solar:gps-bold" />}
                    onClick={handleUseEnterpriseAddress}
                  >
                    Usar endereço da empresa
                  </LoadingButton>
                </Stack>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Buscar endereço ou CEP da loja"
                    placeholder="Ex.: Av. Nazaré, 100, Belém - PA"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    disabled={disabled}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <Iconify icon="solar:map-point-bold-duotone" width={18} />
                        </InputAdornment>
                      ),
                    }}
                  />
                  <LoadingButton
                    variant="outlined"
                    loading={geocoding}
                    disabled={disabled}
                    onClick={() => handleGeocode(searchText)}
                    sx={{ flexShrink: 0 }}
                  >
                    Localizar
                  </LoadingButton>
                </Stack>

                {hasOrigin && (
                  <Typography variant="caption" color="text.secondary">
                    Origem definida: <strong>{value.originLat?.toFixed(5)}</strong>,{' '}
                    <strong>{value.originLng?.toFixed(5)}</strong>
                    {value.originLabel ? ` — ${value.originLabel}` : ''} (você pode clicar ou
                    arrastar o marcador no mapa para ajuste fino)
                  </Typography>
                )}
              </Stack>

              {/* Mapa interativo com raios concêntricos (Mapbox GL quando WebGL suportado; Raster+SVG fallback automático) */}
              <Box
                sx={{
                  position: 'relative',
                  height: 360,
                  borderRadius: 1.5,
                  overflow: 'hidden',
                  border: (theme) => `1px solid ${theme.vars.palette.divider}`,
                }}
              >
                {showWebGlMap ? (
                  <Map
                    ref={mapRef}
                    style={{ width: '100%', height: '100%' }}
                    initialViewState={{
                      latitude: originLat,
                      longitude: originLng,
                      zoom: maxRadiusKm > 10 ? 11 : 12.2,
                    }}
                    mapStyle="mapbox://styles/mapbox/streets-v12"
                    onError={() => {
                      setUseRasterFallback(true);
                    }}
                    onClick={(evt) => {
                      if (disabled) return;
                      onChange({
                        ...value,
                        originLat: Number(evt.lngLat.lat.toFixed(6)),
                        originLng: Number(evt.lngLat.lng.toFixed(6)),
                      });
                    }}
                  >
                    <NavigationControl position="top-right" />

                    {hasOrigin &&
                      activeTiersDesc.map((tier, index) => {
                        const color =
                          tier.color || RADIUS_TIER_COLORS[index % RADIUS_TIER_COLORS.length];
                        const circleData = createCircleGeoJson(originLng, originLat, tier.maxKm);
                        return (
                          <Source
                            key={tier.id}
                            id={`delivery-radius-${tier.id}`}
                            type="geojson"
                            data={circleData}
                          >
                            <Layer
                              id={`delivery-radius-fill-${tier.id}`}
                              type="fill"
                              paint={{
                                'fill-color': color,
                                'fill-opacity': 0.14,
                              }}
                            />
                            <Layer
                              id={`delivery-radius-line-${tier.id}`}
                              type="line"
                              paint={{
                                'line-color': color,
                                'line-width': 2,
                                'line-dasharray': [2, 1.5],
                              }}
                            />
                          </Source>
                        );
                      })}

                    {hasOrigin && (
                      <Marker
                        latitude={originLat}
                        longitude={originLng}
                        draggable={!disabled}
                        onDragEnd={(evt) => {
                          onChange({
                            ...value,
                            originLat: Number(evt.lngLat.lat.toFixed(6)),
                            originLng: Number(evt.lngLat.lng.toFixed(6)),
                          });
                        }}
                      >
                        <Box
                          sx={{
                            width: 34,
                            height: 34,
                            borderRadius: '50%',
                            bgcolor: 'primary.main',
                            color: 'common.white',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: 4,
                            border: '2px solid #fff',
                            cursor: disabled ? 'default' : 'grab',
                          }}
                        >
                          <Iconify icon="solar:shop-bold" width={18} />
                        </Box>
                      </Marker>
                    )}
                  </Map>
                ) : (
                  <DeliveryRadiusRasterMap
                    lat={originLat}
                    lng={originLng}
                    hasOrigin={hasOrigin}
                    activeTiersDesc={activeTiersDesc}
                    initialZoom={maxRadiusKm > 10 ? 11 : 12}
                    disabled={disabled}
                    onSelectOrigin={(nextLat, nextLng) =>
                      onChange({
                        ...value,
                        originLat: nextLat,
                        originLng: nextLng,
                      })
                    }
                  />
                )}

                {maxRadiusKm > 0 && (
                  <Stack
                    direction="row"
                    flexWrap="wrap"
                    gap={0.75}
                    sx={{
                      position: 'absolute',
                      left: 12,
                      bottom: 12,
                      bgcolor: 'background.paper',
                      p: 1,
                      borderRadius: 1,
                      boxShadow: 3,
                      maxWidth: 'calc(100% - 24px)',
                    }}
                  >
                    {[...(value.radiusTiers || [])]
                      .filter((t) => t.active && t.maxKm > 0)
                      .sort((a, b) => a.maxKm - b.maxKm)
                      .map((tier, idx) => (
                        <Chip
                          key={tier.id}
                          size="small"
                          label={`Até ${tier.maxKm} km • ${tier.fee === 0 ? 'Grátis' : fCurrency(tier.fee)}`}
                          sx={{
                            borderLeft: `4px solid ${tier.color || RADIUS_TIER_COLORS[idx % RADIUS_TIER_COLORS.length]}`,
                            fontWeight: 600,
                          }}
                        />
                      ))}
                  </Stack>
                )}
              </Box>

              {/* Tabela de faixas de raio */}
              <Stack spacing={1.5}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography variant="subtitle2">
                    Faixas de distância, taxa e tempo estimado
                  </Typography>
                  <Button
                    size="small"
                    variant="soft"
                    disabled={disabled}
                    startIcon={<Iconify icon="mingcute:add-line" />}
                    onClick={handleAddTier}
                  >
                    Adicionar faixa
                  </Button>
                </Stack>

                {(value.radiusTiers || []).map((tier, idx) => {
                  const color = tier.color || RADIUS_TIER_COLORS[idx % RADIUS_TIER_COLORS.length];
                  return (
                    <Stack
                      key={tier.id}
                      direction={{ xs: 'column', sm: 'row' }}
                      spacing={1.5}
                      alignItems={{ sm: 'center' }}
                      sx={{
                        p: 1.5,
                        borderRadius: 1.25,
                        border: (theme) => `1px solid ${theme.vars.palette.divider}`,
                        borderLeft: `4px solid ${color}`,
                        opacity: tier.active ? 1 : 0.6,
                      }}
                    >
                      <TextField
                        size="small"
                        type="number"
                        label="Até (km)"
                        disabled={disabled}
                        value={tier.maxKm}
                        onChange={(e) =>
                          handleUpdateTier(tier.id, { maxKm: Math.max(0.5, Number(e.target.value)) })
                        }
                        inputProps={{ min: 0.5, step: 0.5 }}
                        sx={{ width: { xs: '100%', sm: 120 } }}
                      />
                      <TextField
                        size="small"
                        type="number"
                        label="Taxa (R$)"
                        disabled={disabled}
                        value={tier.fee}
                        onChange={(e) =>
                          handleUpdateTier(tier.id, { fee: Math.max(0, Number(e.target.value)) })
                        }
                        inputProps={{ min: 0, step: 0.5 }}
                        helperText={tier.fee === 0 ? 'Entrega grátis' : undefined}
                        sx={{ width: { xs: '100%', sm: 140 } }}
                      />
                      <TextField
                        size="small"
                        type="number"
                        label="Tempo (min)"
                        disabled={disabled}
                        value={tier.estimatedMinutes}
                        onChange={(e) =>
                          handleUpdateTier(tier.id, {
                            estimatedMinutes: Math.max(5, Number(e.target.value)),
                          })
                        }
                        inputProps={{ min: 5, step: 5 }}
                        sx={{ width: { xs: '100%', sm: 130 } }}
                      />
                      <FormControlLabel
                        control={
                          <Switch
                            size="small"
                            disabled={disabled}
                            checked={tier.active}
                            onChange={(e) => handleUpdateTier(tier.id, { active: e.target.checked })}
                          />
                        }
                        label="Ativa"
                        sx={{ ml: { sm: 'auto' } }}
                      />
                      <IconButton
                        color="error"
                        size="small"
                        disabled={disabled || (value.radiusTiers || []).length <= 1}
                        onClick={() => handleRemoveTier(tier.id)}
                      >
                        <Iconify icon="solar:trash-bin-trash-bold" width={18} />
                      </IconButton>
                    </Stack>
                  );
                })}
              </Stack>
            </Stack>
          )}

          {/* MODO BAIRROS */}
          {value.mode === 'neighborhood' && (
            <Stack spacing={1.5}>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography variant="subtitle2">Bairros atendidos e taxas</Typography>
                <Button
                  size="small"
                  variant="soft"
                  disabled={disabled}
                  startIcon={<Iconify icon="mingcute:add-line" />}
                  onClick={handleAddNeighborhood}
                >
                  Adicionar bairro
                </Button>
              </Stack>

              {(value.neighborhoods || []).length === 0 ? (
                <Alert severity="info">
                  Nenhum bairro cadastrado ainda. Clique em <strong>Adicionar bairro</strong> para
                  definir as regiões atendidas e a taxa de cada bairro.
                </Alert>
              ) : (
                (value.neighborhoods || []).map((rule) => (
                  <Stack
                    key={rule.id}
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={1.5}
                    alignItems={{ sm: 'center' }}
                    sx={{
                      p: 1.5,
                      borderRadius: 1.25,
                      border: (theme) => `1px solid ${theme.vars.palette.divider}`,
                      opacity: rule.active ? 1 : 0.6,
                    }}
                  >
                    <TextField
                      size="small"
                      label="Bairro"
                      placeholder="Ex.: Nazaré"
                      disabled={disabled}
                      value={rule.name}
                      onChange={(e) => handleUpdateNeighborhood(rule.id, { name: e.target.value })}
                      sx={{ flex: 1 }}
                    />
                    <TextField
                      size="small"
                      label="Cidade (opcional)"
                      placeholder="Ex.: Belém"
                      disabled={disabled}
                      value={rule.city || ''}
                      onChange={(e) => handleUpdateNeighborhood(rule.id, { city: e.target.value })}
                      sx={{ width: { xs: '100%', sm: 160 } }}
                    />
                    <TextField
                      size="small"
                      type="number"
                      label="Taxa (R$)"
                      disabled={disabled}
                      value={rule.fee}
                      onChange={(e) =>
                        handleUpdateNeighborhood(rule.id, {
                          fee: Math.max(0, Number(e.target.value)),
                        })
                      }
                      inputProps={{ min: 0, step: 0.5 }}
                      sx={{ width: { xs: '100%', sm: 120 } }}
                    />
                    <TextField
                      size="small"
                      type="number"
                      label="Tempo (min)"
                      disabled={disabled}
                      value={rule.estimatedMinutes}
                      onChange={(e) =>
                        handleUpdateNeighborhood(rule.id, {
                          estimatedMinutes: Math.max(5, Number(e.target.value)),
                        })
                      }
                      inputProps={{ min: 5, step: 5 }}
                      sx={{ width: { xs: '100%', sm: 120 } }}
                    />
                    <FormControlLabel
                      control={
                        <Switch
                          size="small"
                          disabled={disabled}
                          checked={rule.active}
                          onChange={(e) =>
                            handleUpdateNeighborhood(rule.id, { active: e.target.checked })
                          }
                        />
                      }
                      label="Ativo"
                    />
                    <IconButton
                      color="error"
                      size="small"
                      disabled={disabled}
                      onClick={() => handleRemoveNeighborhood(rule.id)}
                    >
                      <Iconify icon="solar:trash-bin-trash-bold" width={18} />
                    </IconButton>
                  </Stack>
                ))
              )}
            </Stack>
          )}

          {value.mode !== 'fixed' && (
            <FormControlLabel
              control={
                <Switch
                  disabled={disabled}
                  checked={value.blockOutsideArea !== false}
                  onChange={(e) => onChange({ ...value, blockOutsideArea: e.target.checked })}
                />
              }
              label="Bloquear pedidos de entrega fora da área configurada (evitar pedidos fora da rota)"
            />
          )}
        </Stack>
      </Collapse>
    </Card>
  );
}
