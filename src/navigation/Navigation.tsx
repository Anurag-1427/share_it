import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer } from '@react-navigation/native';
import { navigationRef } from '../utils/NavigationUtil';
import SplashScreen from '../screens/SplashScreen';
import HomeScreen from '../screens/HomeScreen';

const Stack = createNativeStackNavigator();

const Navigation = () => {
    return (
        <NavigationContainer ref={navigationRef}>
            <Stack.Navigator initialRouteName='SplashScreen' screenOptions={{
                headerShown: false
            }}>
                <Stack.Screen name='SplashScreen' component={SplashScreen} />
                <Stack.Screen name='HomeScreen' component={HomeScreen} />
            </Stack.Navigator>
        </NavigationContainer>
    )
}

export default Navigation