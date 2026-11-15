import { tryGetErpSessionParams } from 'src/auth/session/erp-session';

import axiosInstance from '../../utils/axios';

/**
 * Llama mediate axios a un servicio post
 * @param {string} nombreServicio
 * @param {Array} param
 * @returns
 */
export const sendPost = async (nameService: string, param: any = {}) => {
  const body = {
    ...param,
    ...getDefaultParams()
  };
  return axiosInstance.post(nameService, body);
};

/**
 * Llama mediate axios a un servicio get
 * @param {string} nombreServicio
 * @param {Array} param
 * @returns
 */
export const sendGet = async (nameService: string, param: any = {}) => {
  const config = {
    params: {
      ...param,
      ...getDefaultParams()
    },
  };
  return axiosInstance.get(nameService, config);
};

/**
 * Llama mediate axios a un servicio delete
 * @param {string} nombreServicio
 * @param {Array} param
 * @returns
 */
export const sendDelete = async (nameService: string, param: any = {}) => {
  const body = {
    data: {
      ...param,
      ...getDefaultParams()
    }
  };
  return axiosInstance.delete(nameService, body);
};


function getDefaultParams() {
  return tryGetErpSessionParams() ?? {};
}
