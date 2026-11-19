import Box from '@mui/material/Box';
import Slider from '@mui/material/Slider';
import ButtonBase from '@mui/material/ButtonBase';

import { CONFIG } from 'src/config-global';
import { setFont, varAlpha, stylesMode } from 'src/theme/styles';

import { Block } from './styles';
import { SvgColor } from '../../svg-color';

// ----------------------------------------------------------------------

type Props = {
  value: string;
  fontSize?: number;
  options: string[];
  onClickOption: (newValue: string) => void;
  onChangeFontSize?: (newValue: number) => void;
};

export function FontOptions({
  value,
  fontSize = 16,
  options,
  onClickOption,
  onChangeFontSize,
}: Props) {
  const labelStyles = {
    lineHeight: '14px',
    color: 'text.secondary',
    alignSelf: 'flex-start',
    fontWeight: 'fontWeightSemiBold',
    fontSize: (theme: any) => theme.typography.pxToRem(11),
  };

  return (
    <Block title="Font" sx={{ gap: 2.5 }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <ButtonBase component="button" type="button" disableRipple sx={labelStyles}>
          Family
        </ButtonBase>

        <Box component="ul" gap={1.5} display="grid" gridTemplateColumns="repeat(2, 1fr)">
          {options.map((option) => {
            const selected = value === option;

            return (
              <Box component="li" key={option} sx={{ display: 'inline-flex' }}>
                <ButtonBase
                  disableRipple
                  onClick={() => onClickOption(option)}
                  sx={{
                    py: 2,
                    width: 1,
                    gap: 0.75,
                    borderWidth: 1,
                    borderRadius: 1.5,
                    borderStyle: 'solid',
                    display: 'inline-flex',
                    flexDirection: 'column',
                    borderColor: 'transparent',
                    fontFamily: setFont(option),
                    fontWeight: 'fontWeightMedium',
                    fontSize: (theme) => theme.typography.pxToRem(12),
                    color: (theme) => theme.vars.palette.text.disabled,
                    ...(selected && {
                      color: (theme) => theme.vars.palette.text.primary,
                      borderColor: (theme) => varAlpha(theme.vars.palette.grey['500Channel'], 0.08),
                      boxShadow: (theme) =>
                        `-8px 8px 20px -4px ${varAlpha(theme.vars.palette.grey['500Channel'], 0.12)}`,
                      [stylesMode.dark]: {
                        boxShadow: (theme) =>
                          `-8px 8px 20px -4px ${varAlpha(theme.vars.palette.common.blackChannel, 0.12)}`,
                      },
                    }),
                  }}
                >
                  <SvgColor
                    src={`${CONFIG.site.basePath}/assets/icons/setting/ic-font.svg`}
                    sx={{
                      width: 28,
                      height: 28,
                      color: 'currentColor',
                      ...(selected && {
                        background: (theme) =>
                          `linear-gradient(135deg, ${theme.vars.palette.primary.light}, ${theme.vars.palette.primary.main})`,
                      }),
                    }}
                  />

                  {option}
                </ButtonBase>
              </Box>
            );
          })}
        </Box>
      </Box>

      {onChangeFontSize && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <ButtonBase component="button" type="button" disableRipple sx={labelStyles}>
            Size
          </ButtonBase>

          <Slider
            size="small"
            step={1}
            min={12}
            max={20}
            marks
            value={fontSize}
            valueLabelDisplay="on"
            aria-label="Change font size"
            valueLabelFormat={(val) => `${val}px`}
            onChange={(_event: Event, newValue: number | number[]) =>
              onChangeFontSize(newValue as number)
            }
            sx={{ width: 1, mt: 2, mb: 0.5 }}
          />
        </Box>
      )}
    </Block>
  );
}
