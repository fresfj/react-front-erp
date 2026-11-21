import type {
  OnlineOrderDeliveryType,
  OnlineOrderFulfillmentStatus,
} from 'src/api/firestore/online-orders';

import { Fragment } from 'react';

import Box from '@mui/material/Box';
import Step from '@mui/material/Step';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Stepper from '@mui/material/Stepper';
import StepLabel from '@mui/material/StepLabel';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';

import { varAlpha } from 'src/theme/styles';

import { Iconify } from 'src/components/iconify';

// ----------------------------------------------------------------------

type Props = {
  status: OnlineOrderFulfillmentStatus;
  deliveryType: OnlineOrderDeliveryType;
  rejectedReason?: string;
  /** Quando true, exibe sempre o modo compacto (somente etapa atual e próxima com rótulo). */
  compact?: boolean;
};

type StepDef = {
  key: OnlineOrderFulfillmentStatus;
  label: string;
  icon: string;
};

const STEP_INDEX: Record<OnlineOrderFulfillmentStatus, number> = {
  pending: 0,
  accepted: 1,
  preparing: 2,
  out_for_delivery: 3,
  delivered: 4,
  rejected: -1,
  cancelled: -1,
};

export function getFulfillmentLabel(
  status: OnlineOrderFulfillmentStatus,
  deliveryType: OnlineOrderDeliveryType
): { label: string; color: 'warning' | 'info' | 'primary' | 'success' | 'error' } {
  switch (status) {
    case 'accepted':
      return { label: 'Pedido Aceito', color: 'info' };
    case 'preparing':
      return { label: 'Em preparação', color: 'primary' };
    case 'out_for_delivery':
      return {
        label:
          deliveryType === 'delivery'
            ? 'Saiu para entrega'
            : deliveryType === 'table'
              ? 'Pronto p/ servir'
              : 'Pronto para retirada',
        color: 'primary',
      };
    case 'delivered':
      return { label: 'Finalizado', color: 'success' };
    case 'rejected':
      return { label: 'Recusado pela loja', color: 'error' };
    case 'cancelled':
      return { label: 'Cancelado', color: 'error' };
    default:
      return { label: 'Aguardando aprovação', color: 'warning' };
  }
}

export function OrderProgressStepper({ status, deliveryType, rejectedReason, compact }: Props) {
  if (status === 'rejected' || status === 'cancelled') {
    return (
      <Alert severity="error" sx={{ textAlign: 'left', borderRadius: 1.5 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {status === 'rejected' ? 'Pedido recusado pela loja' : 'Pedido cancelado'}
        </Typography>
        {rejectedReason && (
          <Typography variant="caption" component="div" sx={{ mt: 0.25 }}>
            Motivo: {rejectedReason}
          </Typography>
        )}
      </Alert>
    );
  }

  const steps: StepDef[] = [
    { key: 'pending', label: 'Recebido', icon: 'solar:document-text-bold' },
    { key: 'accepted', label: 'Aceito', icon: 'solar:check-circle-bold' },
    { key: 'preparing', label: 'Em preparação', icon: 'solar:box-bold' },
    {
      key: 'out_for_delivery',
      label:
        deliveryType === 'delivery'
          ? 'Saiu p/ entrega'
          : deliveryType === 'table'
            ? 'Pronto p/ servir'
            : 'Pronto p/ retirada',
      icon:
        deliveryType === 'delivery'
          ? 'solar:scooter-bold'
          : deliveryType === 'table'
            ? 'solar:plate-bold'
            : 'solar:shop-bold',
    },
    { key: 'delivered', label: 'Finalizado', icon: 'solar:verified-check-bold' },
  ];

  const activeStep = STEP_INDEX[status] ?? 0;
  const progressPercent = Math.round(((activeStep + 1) / steps.length) * 100);
  const nextStep = activeStep < steps.length - 1 ? steps[activeStep + 1] : null;
  const isDelivered = status === 'delivered';

  return (
    <Box sx={{ width: '100%', overflow: 'hidden' }}>
      {/* Barra de progresso linear + percentual (Desktop e Mobile) */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
          Andamento do pedido
        </Typography>
        <Typography
          variant="caption"
          color={isDelivered ? 'success.main' : 'primary.main'}
          sx={{ fontWeight: 700 }}
        >
          {progressPercent}%
        </Typography>
      </Stack>

      <LinearProgress
        variant="determinate"
        value={progressPercent}
        color={isDelivered ? 'success' : 'primary'}
        sx={{
          height: 8,
          borderRadius: 4,
          mb: 2.5,
          bgcolor: (theme) => varAlpha(theme.vars.palette.grey['500Channel'], 0.16),
        }}
      />

      {/* DESKTOP (>= 768px): Todos os 5 passos visíveis (oculto quando compact=true) */}
      {!compact && (
        <Box
          sx={{
            display: 'none',
            '@media (min-width: 768px)': {
              display: 'block',
            },
          }}
        >
          <Stepper activeStep={activeStep} alternativeLabel>
            {steps.map((step, index) => {
              const isCompleted = index < activeStep || isDelivered;
              const isCurrent = index === activeStep && !isDelivered;

              return (
                <Step key={step.key} completed={isCompleted}>
                  <StepLabel
                    StepIconComponent={() => (
                      <Box
                        sx={{
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          bgcolor: isCompleted
                            ? 'success.main'
                            : isCurrent
                              ? 'primary.main'
                              : (theme) => varAlpha(theme.vars.palette.grey['500Channel'], 0.16),
                          color: isCompleted || isCurrent ? 'common.white' : 'text.disabled',
                          boxShadow: isCurrent
                            ? (theme) =>
                                `0 0 0 4px ${varAlpha(theme.vars.palette.primary.mainChannel, 0.2)}`
                            : undefined,
                          transition: 'all 0.25s',
                        }}
                      >
                        <Iconify icon={step.icon} width={17} />
                      </Box>
                    )}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: isCurrent || isCompleted ? 700 : 400,
                        color: isCurrent
                          ? 'primary.main'
                          : isCompleted
                            ? 'text.primary'
                            : 'text.disabled',
                        fontSize: 12,
                      }}
                    >
                      {step.label}
                    </Typography>
                  </StepLabel>
                </Step>
              );
            })}
          </Stepper>
        </Box>
      )}

      {/* COMPACTO (Mobile < 768px ou sempre quando compact=true): Foco no Atual e Próximo */}
      <Box
        sx={{
          display: 'block',
          ...(!compact && {
            '@media (min-width: 768px)': {
              display: 'none',
            },
          }),
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            width: '100%',
            px: 0.5,
          }}
        >
          {steps.map((step, index) => {
            const isPast = index < activeStep;
            const isCurrent = index === activeStep;
            const isNext = index === activeStep + 1;
            const isFuture = index > activeStep + 1;
            const lineCompleted = index < activeStep || isDelivered;

            return (
              <Fragment key={step.key}>
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    flexShrink: 0,
                    maxWidth: isCurrent ? 86 : isNext ? 74 : 22,
                    textAlign: 'center',
                  }}
                >
                  {/* Container de altura fixa (40px) para manter todas as linhas conectoras alinhadas */}
                  <Box
                    sx={{
                      height: 40,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {isPast && (
                      <Box
                        aria-label={`${step.label} concluído`}
                        sx={{
                          width: 22,
                          height: 22,
                          borderRadius: '50%',
                          bgcolor: 'success.main',
                          color: 'common.white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Iconify icon="eva:checkmark-fill" width={14} />
                      </Box>
                    )}

                    {isCurrent && (
                      <Box
                        sx={{
                          width: 40,
                          height: 40,
                          borderRadius: '50%',
                          bgcolor: isDelivered ? 'success.main' : 'primary.main',
                          color: 'common.white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: (theme) =>
                            `0 0 0 4px ${varAlpha(
                              isDelivered
                                ? theme.vars.palette.success.mainChannel
                                : theme.vars.palette.primary.mainChannel,
                              0.22
                            )}`,
                        }}
                      >
                        <Iconify icon={step.icon} width={20} />
                      </Box>
                    )}

                    {isNext && (
                      <Box
                        sx={{
                          width: 30,
                          height: 30,
                          borderRadius: '50%',
                          bgcolor: (theme) => varAlpha(theme.vars.palette.grey['500Channel'], 0.16),
                          color: 'text.secondary',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Iconify icon={step.icon} width={15} />
                      </Box>
                    )}

                    {isFuture && (
                      <Box
                        aria-label={`${step.label} pendente`}
                        sx={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          bgcolor: (theme) => varAlpha(theme.vars.palette.grey['500Channel'], 0.32),
                        }}
                      />
                    )}
                  </Box>

                  {/* Textos somente no Passo Atual (destaque) e Próximo Passo (sutil) */}
                  {isCurrent && (
                    <Typography
                      variant="caption"
                      sx={{
                        mt: 0.75,
                        fontWeight: 700,
                        fontSize: 12,
                        lineHeight: 1.25,
                        color: isDelivered ? 'success.main' : 'primary.main',
                      }}
                    >
                      {step.label}
                    </Typography>
                  )}

                  {isNext && (
                    <Typography
                      variant="caption"
                      sx={{
                        mt: 0.75,
                        fontWeight: 500,
                        fontSize: 10.5,
                        lineHeight: 1.2,
                        color: 'text.secondary',
                        opacity: 0.85,
                      }}
                    >
                      {step.label}
                    </Typography>
                  )}
                </Box>

                {/* Conector horizontal entre etapas */}
                {index < steps.length - 1 && (
                  <Box
                    sx={{
                      flex: 1,
                      minWidth: 4,
                      height: 2,
                      mt: '19px',
                      mx: 0.25,
                      borderRadius: 1,
                      bgcolor: lineCompleted
                        ? 'success.main'
                        : (theme) => varAlpha(theme.vars.palette.grey['500Channel'], 0.24),
                    }}
                  />
                )}
              </Fragment>
            );
          })}
        </Box>

        {/* Legenda limpa indicando a próxima etapa no Mobile */}
        <Typography
          variant="caption"
          component="div"
          sx={{
            mt: 1.5,
            textAlign: 'center',
            color: 'text.secondary',
          }}
        >
          {nextStep ? (
            <>
              Próxima etapa: <strong>{nextStep.label}</strong>
            </>
          ) : (
            <Box component="span" sx={{ color: 'success.main', fontWeight: 700 }}>
              Pedido concluído com sucesso
            </Box>
          )}
        </Typography>
      </Box>
    </Box>
  );
}
