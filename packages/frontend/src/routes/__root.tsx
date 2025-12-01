/*
To set up new routes:
    (this is definitely not the best way to be doing it, but after hours
    of debugging this is how i was able to get it to work)

    set up your component file (it will look like most the other ones)
        like index.tsx for example 
        (also make sure the file extensions are tsx cause jsx just wasn't
        working for some reason)

    once the component is set up, you need to set up the route in main.tsx
        import the new component like so:
            import RangePage from './routes/range'
            (you can find the other examples in main.tsx and copy those)

    once the import is done, you create the route by creating a function 
    below those imports, for example:

        const indexRoute = createRoute({
            getParentRoute: () => rootRoute,
            path: '/',
            component: App,
        })

    lastly, add the page you want to route to the routeTree just below the
    route functions, for example:
        const routeTree = rootRoute.addChildren([indexRoute, rangeRoute, teamRoute])

    if you go to the webpage there will be a tanstack button near the
    bottom, here you can check teh routes on the right-hand side to 
    verify that it worked
*/

import { createRootRoute, Outlet } from '@tanstack/react-router'
// import React from "react";

export const Route = createRootRoute({
    component: () => (
        <>
            <div className="p-2 flex gap-1">
                {/* Navigate can go here if it's universal */}
            </div>
            <Outlet /> {/* This is where child routes will be rendered */}
       </>
   ),
})
