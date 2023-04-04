import { setGlobalState } from '../actions/globalActions';
import Axios from 'axios';
import { axiosConfig } from './helpers';

import type { Dispatch } from 'react';
import type { TFunction } from 'i18next';
import type { AppAction, ClientParty, IMediaItem } from '../../../shared/types';

const getUpdatedUserParties = async (
    dispatch: Dispatch<AppAction>,
    t: TFunction
): Promise<ClientParty[]> => {
    try {
        const response = await Axios.get('/api/userParties', axiosConfig());

        if (response.data.success) {
            dispatch(
                setGlobalState({
                    userParties: response.data.userParties
                })
            );

            return Promise.resolve(response.data.userParties);
        } else {
            dispatch(
                setGlobalState({
                    errorMessage: t(`apiResponseMessages.${response.data.msg}`)
                })
            );

            return Promise.reject(new Error('Not successful'));
        }
    } catch (error) {
        dispatch(
            setGlobalState({
                errorMessage: t(`errors.userPartyFetchError`)
            })
        );
        return Promise.reject(error);
    }
};

const getUpdatedUserItems = async (
    dispatch: Dispatch<AppAction>,
    t: TFunction
): Promise<IMediaItem[]> => {
    try {
        const response = await Axios.get('/api/userItems', axiosConfig());

        if (response.data.success) {
            dispatch(
                setGlobalState({
                    userItems: response.data.userItems
                })
            );

            return Promise.resolve(response.data.userItems);
        } else {
            dispatch(
                setGlobalState({
                    errorMessage: t(`apiResponseMessages.${response.data.msg}`)
                })
            );

            return Promise.reject(new Error('Not successful'));
        }
    } catch (error) {
        dispatch(
            setGlobalState({
                errorMessage: t(`errors.userItemFetchError`)
            })
        );

        return Promise.reject(error);
    }
};

export { getUpdatedUserParties, getUpdatedUserItems };
